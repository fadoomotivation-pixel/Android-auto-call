// RAG ingest — turns material into retrievable knowledge.
// Body: { title?, source_kind?, source_id?, text, scope?, company_id?, offset?, batch? }
//   or:  { mode: 'edit', id, content, title? }  → correct ONE fact, re-embedded.
//   scope 'global'  → shared brain for ALL companies (company_id = null).
//                     Platform super-admin ONLY.
//   scope 'company' → a single company's private brain (default).
//                     Company admins use their own; super-admin may target any
//                     company via company_id.
//
// BATCHED: embedding many chunks at once blew the edge CPU budget (HTTP 546) on
// a full book. Each call now embeds at most `batch` chunks starting at `offset`
// and returns { done, next } so the caller loops until done. The old-chunk
// cleanup runs only on the first batch (offset 0), so batches don't wipe each
// other. The gte-small model (384-dim, free) and knowledge_chunks table are the
// SAME ones rep-coach / rag-ask / win-harvest use — one brain, no copy.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

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
  return out.slice(0, 400); // safety cap
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const auth = req.headers.get("Authorization") ?? "";
  const bearer = auth.replace(/^Bearer\s+/i, "").trim();
  const isService = bearer === SERVICE;

  const bodyIn = await req.json().catch(() => ({} as Record<string, unknown>));

  // ---- Authorize + resolve who may write where. ----
  let isSuper = false;
  let profCompany: string | null = null;
  let actorId: string | null = null;
  if (isService) {
    isSuper = true; // admin tooling: may target global or any company
  } else {
    const u = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
    const { data: ud } = await u.auth.getUser();
    if (!ud?.user) return json({ ok: false, error: "Unauthorized" }, 401);
    const { data: prof } = await u.from("profiles").select("role, company_id").eq("id", ud.user.id).maybeSingle();
    const { data: pa } = await u.from("platform_admins").select("user_id").eq("user_id", ud.user.id).maybeSingle();
    const isAdmin = prof?.role === "admin" || !!pa;
    if (!isAdmin) return json({ ok: false, error: "Admins only." }, 403);
    isSuper = !!pa;
    profCompany = (prof?.company_id as string) ?? null;
    actorId = ud.user.id;
  }

  // ---------- correcting one fact ----------
  //
  // A wrong price used to mean deleting the whole source and re-uploading it.
  // This corrects a single chunk in place — and RE-EMBEDS it, which is the
  // whole point. match_knowledge() searches the 384-dim vector, never the text.
  // Saving new wording against the old vector would leave the coach quoting the
  // price you just fixed while the screen shows the correction: both "working",
  // no error anywhere. So the new text and its new vector are written in ONE
  // statement, and if the model is unreachable we change nothing at all.
  //
  // (Migration 0142 adds a trigger that nulls the embedding on any UPDATE that
  // changes content without supplying a vector — the backstop for a write path
  // that isn't this one. Because this path always sends both, it never fires.)
  if (bodyIn.mode === "edit") {
    const id = String(bodyIn.id ?? "").trim();
    const newContent = String(bodyIn.content ?? "").trim();
    const newTitle = bodyIn.title === undefined
      ? undefined
      : (bodyIn.title === null ? null : String(bodyIn.title).slice(0, 200));

    if (!id) return json({ ok: false, error: "No fact chosen." }, 400);
    if (!newContent) return json({ ok: false, error: "A fact can't be empty. Delete it instead." }, 400);
    // One chunk is ~700 chars by design; a much longer paste belongs in the
    // uploader, which splits it so each piece stays retrievable on its own.
    if (newContent.length > 3000) {
      return json({ ok: false, error: "Too long for one fact. Re-upload it as a source so it gets split properly." }, 400);
    }

    // Named `db`, not `admin`: the ingest path below declares its own `admin` at
    // function scope. Two same-named consts in nested scopes is legal and reads
    // like a bug — and a genuine duplicate const is what took three functions
    // down with a BOOT_ERROR once. Different name, no second guessing.
    const db = createClient(SUPABASE_URL, SERVICE);
    const { data: row, error: readErr } = await db
      .from("knowledge_chunks").select("id, company_id").eq("id", id).maybeSingle();
    if (readErr) return json({ ok: false, error: readErr.message }, 500);
    if (!row) return json({ ok: false, error: "That fact no longer exists — refresh the list." }, 404);

    // The service-role client below BYPASSES RLS, so permission is decided
    // here, by the same rule as the knowledge_chunks_update policy: global
    // knowledge is shared into every company's brain and belongs to the
    // platform owner alone; a company admin may only correct their own.
    const mayEdit = isSuper || (row.company_id !== null && row.company_id === profCompany);
    if (!mayEdit) {
      return json({ ok: false, error: row.company_id === null
        ? "Global knowledge is edited by the platform admin."
        : "That fact belongs to another company." }, 403);
    }

    let embedding: number[];
    try {
      const model = new Supabase.ai.Session("gte-small");
      embedding = await model.run(newContent, { mean_pool: true, normalize: true });
    } catch (_e) {
      // Refusing outright beats saving text the AI would still find by its old
      // wording. Nothing has been written at this point.
      return json({ ok: false, error: "Could not re-teach that fact to the AI just now. Nothing was changed — try again." }, 502);
    }

    const patch: Record<string, unknown> = {
      content: newContent, embedding, updated_at: new Date().toISOString(), updated_by: actorId,
    };
    if (newTitle !== undefined) patch.title = newTitle;

    const { error: upErr } = await db.from("knowledge_chunks").update(patch).eq("id", id);
    if (upErr) return json({ ok: false, error: upErr.message }, 500);
    return json({ ok: true, mode: "edit", id, reembedded: true });
  }

  const text: string = String(bodyIn.text ?? "").trim();
  const title: string | null = bodyIn.title ? String(bodyIn.title).slice(0, 200) : null;
  const sourceKind: string = ["brochure", "price", "faq", "call", "note", "guide", "offer", "win"].includes(String(bodyIn.source_kind)) ? String(bodyIn.source_kind) : "note";
  const sourceId: string | null = bodyIn.source_id ? String(bodyIn.source_id).slice(0, 100) : null;
  if (!text) return json({ ok: false, error: "Empty text." }, 400);

  const isGlobal = bodyIn.scope === "global";
  let companyId: string | null;
  if (isGlobal) {
    if (!isSuper) return json({ ok: false, error: "Global training is super-admin only." }, 403);
    companyId = null;
  } else {
    companyId = (isSuper && bodyIn.company_id) ? String(bodyIn.company_id) : profCompany;
    if (!companyId) return json({ ok: false, error: "No company." }, 400);
  }

  const chunks = chunk(text);
  if (chunks.length === 0) return json({ ok: false, error: "Nothing to ingest." }, 400);

  // Batch window — keeps embedding under the edge CPU budget.
  const offset = Math.max(0, Math.floor(Number(bodyIn.offset) || 0));
  const batch = Math.min(Math.max(Math.floor(Number(bodyIn.batch) || 5), 1), 8);

  const admin = createClient(SUPABASE_URL, SERVICE);
  // Re-ingesting a source replaces its old chunks — but only on the first batch,
  // so later batches of the same upload don't delete earlier ones.
  if (offset === 0 && sourceId) {
    const del = admin.from("knowledge_chunks").delete().eq("source_id", sourceId);
    await (companyId === null ? del.is("company_id", null) : del.eq("company_id", companyId));
  }

  const slice = chunks.slice(offset, offset + batch);
  const model = new Supabase.ai.Session("gte-small");
  let stored = 0;
  for (const c of slice) {
    try {
      const embedding = await model.run(c, { mean_pool: true, normalize: true });
      const { error } = await admin.from("knowledge_chunks").insert({
        company_id: companyId, source_kind: sourceKind, source_id: sourceId,
        title, content: c, embedding,
      });
      if (!error) stored++;
    } catch (_e) { /* skip a chunk that fails to embed */ }
  }

  const nextOffset = offset + batch;
  const done = nextOffset >= chunks.length;
  return json({ ok: true, chunks: chunks.length, stored, offset, next: done ? null : nextOffset, done });
});
