// RAG ingest — turns material into retrievable knowledge.
// Body: { title?, source_kind?, source_id?, text, scope?, company_id? }
//   scope 'global'  → shared brain for ALL companies (company_id = null).
//                     Platform super-admin ONLY.
//   scope 'company' → a single company's private brain (default).
//                     Company admins use their own; super-admin may target any
//                     company via company_id.
// Splits the text into ~overlapping chunks, embeds each with Supabase Edge's
// built-in gte-small model (384-dim, free — no external embedding API), and
// stores them in knowledge_chunks for the coach to retrieve.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Supabase's on-edge embedding model (no key, no external call).
declare const Supabase: { ai: { Session: new (m: string) => { run(input: string, opts: { mean_pool: boolean; normalize: boolean }): Promise<number[]> } } };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(o: unknown, s = 200) {
  return new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
}
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/** Split text into ~700-char chunks on sentence/line boundaries, with a little
 *  overlap so a fact split across a boundary is still retrievable. */
function chunk(text: string): string[] {
  const clean = text.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
  if (clean.length <= 700) return clean ? [clean] : [];
  const parts = clean.split(/(?<=[.!?])\s+|\n{2,}/);
  const out: string[] = [];
  let buf = "";
  for (const p of parts) {
    if ((buf + " " + p).length > 700 && buf) {
      out.push(buf.trim());
      buf = buf.slice(-120) + " " + p; // carry a little overlap
    } else {
      buf = buf ? `${buf} ${p}` : p;
    }
  }
  if (buf.trim()) out.push(buf.trim());
  return out.slice(0, 200); // safety cap per ingest call
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const auth = req.headers.get("Authorization") ?? "";
  const u = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
  const { data: ud } = await u.auth.getUser();
  if (!ud?.user) return json({ ok: false, error: "Unauthorized" }, 401);

  // Only admins / super admins may add knowledge.
  const { data: prof } = await u.from("profiles").select("role, company_id").eq("id", ud.user.id).maybeSingle();
  const { data: pa } = await u.from("platform_admins").select("user_id").eq("user_id", ud.user.id).maybeSingle();
  const isAdmin = prof?.role === "admin" || !!pa;
  if (!isAdmin) return json({ ok: false, error: "Admins only." }, 403);

  const bodyIn = await req.json().catch(() => ({}));
  const text: string = String(bodyIn.text ?? "").trim();
  const title: string | null = bodyIn.title ? String(bodyIn.title).slice(0, 200) : null;
  const sourceKind: string = ["brochure", "price", "faq", "call", "note", "guide", "offer"].includes(bodyIn.source_kind) ? bodyIn.source_kind : "note";
  const sourceId: string | null = bodyIn.source_id ? String(bodyIn.source_id).slice(0, 100) : null;
  if (!text) return json({ ok: false, error: "Empty text." }, 400);

  // GLOBAL scope trains the shared brain for every company — platform super-admin
  // only. COMPANY scope stays isolated: super-admin may target any company;
  // company admins are pinned to their own.
  const isGlobal = bodyIn.scope === "global";
  let companyId: string | null;
  if (isGlobal) {
    if (!pa) return json({ ok: false, error: "Global training is super-admin only." }, 403);
    companyId = null;
  } else {
    companyId = (pa && bodyIn.company_id) ? String(bodyIn.company_id) : (prof?.company_id ?? null);
    if (!companyId) return json({ ok: false, error: "No company." }, 400);
  }

  const chunks = chunk(text);
  if (chunks.length === 0) return json({ ok: false, error: "Nothing to ingest." }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE);
  // Re-ingesting the same source replaces its old chunks (idempotent).
  if (sourceId) {
    const del = admin.from("knowledge_chunks").delete().eq("source_id", sourceId);
    await (companyId === null ? del.is("company_id", null) : del.eq("company_id", companyId));
  }

  const model = new Supabase.ai.Session("gte-small");
  let stored = 0;
  for (const c of chunks) {
    try {
      const embedding = await model.run(c, { mean_pool: true, normalize: true });
      const { error } = await admin.from("knowledge_chunks").insert({
        company_id: companyId, source_kind: sourceKind, source_id: sourceId,
        title, content: c, embedding,
      });
      if (!error) stored++;
    } catch (_e) { /* skip a chunk that fails to embed */ }
  }

  return json({ ok: true, chunks: chunks.length, stored });
});
