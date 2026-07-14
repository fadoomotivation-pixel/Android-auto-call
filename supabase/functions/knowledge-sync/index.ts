// RAG v2 — knowledge that builds itself. Instead of the admin typing, this
// pulls the company's OWN proven material and turns it into retrievable
// knowledge, one tap:
//   • Won-deal call transcripts  → the exact words that actually closed deals
//   • Content library (brochures / links with descriptions)
// Embeds each chunk on the Supabase edge (gte-small, free) and stores it,
// idempotent per source so re-syncing never duplicates.
// Body: { }  (admin / super-admin only; company from the caller's profile)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

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

function chunk(text: string): string[] {
  const clean = (text ?? "").replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
  if (!clean) return [];
  if (clean.length <= 700) return [clean];
  const parts = clean.split(/(?<=[.!?])\s+|\n{2,}/);
  const out: string[] = [];
  let buf = "";
  for (const p of parts) {
    if ((buf + " " + p).length > 700 && buf) { out.push(buf.trim()); buf = buf.slice(-120) + " " + p; }
    else buf = buf ? `${buf} ${p}` : p;
  }
  if (buf.trim()) out.push(buf.trim());
  return out.slice(0, 40); // cap per source
}

async function ingestSource(
  admin: SupabaseClient,
  model: { run(i: string, o: { mean_pool: boolean; normalize: boolean }): Promise<number[]> },
  companyId: string, sourceKind: string, sourceId: string, title: string, text: string,
): Promise<number> {
  const chunks = chunk(text);
  if (chunks.length === 0) return 0;
  // Idempotent: replace this source's old chunks.
  await admin.from("knowledge_chunks").delete().eq("company_id", companyId).eq("source_id", sourceId);
  let stored = 0;
  for (const c of chunks) {
    try {
      const embedding = await model.run(c, { mean_pool: true, normalize: true });
      const { error } = await admin.from("knowledge_chunks").insert({
        company_id: companyId, source_kind: sourceKind, source_id: sourceId, title, content: c, embedding,
      });
      if (!error) stored++;
    } catch (_e) { /* skip */ }
  }
  return stored;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const auth = req.headers.get("Authorization") ?? "";
  const u = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
  const { data: ud } = await u.auth.getUser();
  if (!ud?.user) return json({ ok: false, error: "Unauthorized" }, 401);

  const { data: prof } = await u.from("profiles").select("role, company_id").eq("id", ud.user.id).maybeSingle();
  const { data: pa } = await u.from("platform_admins").select("user_id").eq("user_id", ud.user.id).maybeSingle();
  if (prof?.role !== "admin" && !pa) return json({ ok: false, error: "Admins only." }, 403);
  const companyId = prof?.company_id;
  if (!companyId) return json({ ok: false, error: "No company." }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE);
  const model = new Supabase.ai.Session("gte-small");
  let sources = 0, stored = 0;

  // 1. Content library — brochures / links with a description worth learning.
  const { data: assets } = await admin.from("content_assets")
    .select("id, kind, title, description, url").eq("company_id", companyId).eq("active", true);
  for (const a of assets ?? []) {
    const text = [a.title, a.description, a.url].filter(Boolean).join(" — ");
    const n = await ingestSource(admin, model, companyId, a.kind === "brochure" ? "brochure" : "note", `asset:${a.id}`, a.title ?? "Library item", text);
    if (n > 0) { sources++; stored += n; }
  }

  // 2. Won-deal call transcripts — the words that ACTUALLY closed deals.
  const { data: wonContacts } = await admin.from("contacts")
    .select("id, name").eq("company_id", companyId).in("status", ["booked", "token_paid"]).limit(300);
  const wonById = new Map((wonContacts ?? []).map((c: { id: string; name: string | null }) => [c.id, c.name]));
  if (wonById.size > 0) {
    const { data: calls } = await admin.from("call_logs")
      .select("id, contact_id, transcript")
      .eq("company_id", companyId)
      .in("contact_id", Array.from(wonById.keys()))
      .not("transcript", "is", null)
      .limit(500);
    for (const c of calls ?? []) {
      const t = (c.transcript ?? "").trim();
      if (t.length < 60) continue; // skip trivial
      const who = wonById.get(c.contact_id) ?? "customer";
      const n = await ingestSource(admin, model, companyId, "call", `call:${c.id}`, `Winning call — ${who}`, t);
      if (n > 0) { sources++; stored += n; }
    }
  }

  return json({ ok: true, sources, stored });
});
