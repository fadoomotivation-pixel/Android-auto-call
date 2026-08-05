// Win harvest — the shared winning brain.
//
// When a lead is driven forward to a site visit / booking, this reads that
// lead's whole journey (call transcripts + summaries, voice notes, the rep's
// notes) and distills "kya kaam aaya" — the concrete moves that worked — into a
// short lesson, then stores it in the COMPANY's knowledge brain
// (knowledge_chunks, source_kind = 'win'). match_knowledge then surfaces it to
// EVERY rep in that company, so one rep's win teaches the whole team. Company
// isolation holds: wins stay inside the company that earned them.
//
// Modes:
//   POST { contact_id }            (rep/admin JWT)  → harvest that one lead.
//   POST { mode:"scan", limit }    (service key)    → batch: newly-won leads
//                                                     that don't have a win yet.
//
// Linked, not duplicated: it embeds with the SAME gte-small model and writes to
// the SAME knowledge_chunks table that knowledge-ingest / rep-coach / rag-ask
// use — no parallel store.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { loadStages, isWon, labelOf } from "../_shared/stage.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GROQ = Deno.env.get("GROQ_API_KEY") ?? "";

// This list used to be called WON and contained site_visit. It was not a list
// of wins: on the day it was fixed, all 28 'win' chunks in the shared brain came
// from leads that had reached a site visit and stopped, and no lead had EVER
// been booked or token-paid. Every rep in every company was being taught the
// tactics of getting a site visit under the heading "what closes deals".
//
// Advancement is still worth learning from — it is most of what a telecaller
// controls. It just has to be LABELLED as advancement. So the harvest now
// stores two kinds of lesson and says which is which:
//
//   source_kind 'win'      — outcome = 'won'. A real booking.
//   source_kind 'progress' — advanced and not lost. What moved it forward.
//
// Both feed the same match_knowledge brain (there is only ever one), but the
// coach can now tell a rep "this closed a deal" apart from "this got a visit".
const LEARNABLE = ["interested", "site_visit", "negotiation", "proposal", "token_paid", "booked"];

// deno-lint-ignore no-explicit-any
const embedModel = new (Supabase as any).ai.Session("gte-small");

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

async function groqJson(system: string, user: string, temperature = 0.4): Promise<Record<string, unknown> | null> {
  if (!GROQ) return null;
  try {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${GROQ}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile", temperature, response_format: { type: "json_object" },
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
      }),
    });
    const raw = (await r.json()).choices?.[0]?.message?.content ?? "";
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * The prompt must not overclaim either. Telling the model it is studying "a WON
 * lead" when the lead only reached a site visit invites it to write closing
 * advice it has no evidence for — the model will happily narrate a booking that
 * never happened. It is told exactly how far the lead actually got.
 */
function lessonSystem(won: boolean, stageLabel: string): string {
  return (
    won
      ? "You are a real-estate sales trainer studying a lead that was WON — the customer actually booked. "
      : `You are a real-estate sales trainer studying a lead that was ADVANCED to "${stageLabel}" and has NOT ` +
        "been booked. Do not claim or imply the deal closed. Extract only what moved it to this stage. "
  ) +
  "The material may be in Hindi, English or Hinglish — understand all three. From the calls, voice notes and " +
  "notes, extract the concrete moves that ACTUALLY worked — the lines said, the objection handled, the offer " +
  "used, the timing. " +
  'Reply ONLY as JSON {"lesson": string}. lesson = a short reusable playbook note (max ~80 words) in easy Roman ' +
  "Hinglish (aap-form) that ANOTHER telecaller could copy on a similar lead. Be specific (quote the actual line " +
  'or offer that worked). If nothing clearly worked, reply {"lesson": ""}. NEVER invent details that are not in ' +
  "the material, and never state an outcome that did not happen.";
}

/** Harvest one contact into a company 'win' knowledge chunk. Idempotent by
 *  source_id. Returns true when a lesson was stored. */
async function harvestOne(admin: SupabaseClient, contactId: string): Promise<boolean> {
  const { data: c } = await admin.from("contacts")
    .select("id, company_id, name, status, budget, territory, site_visit_project, notes")
    .eq("id", contactId).maybeSingle();
  if (!c?.company_id || !LEARNABLE.includes(String(c.status))) return false;

  // What this lead ACTUALLY reached, from the canonical table — never a guess
  // and never a local list.
  const stages = await loadStages(admin);
  const won = isWon(stages, c.status);
  const stageLabel = labelOf(stages, c.status);

  const [{ data: calls }, { data: notes }] = await Promise.all([
    admin.from("call_logs")
      .select("summary, transcript, outcome, duration_seconds, started_at")
      .eq("contact_id", contactId)
      .order("started_at", { ascending: true }).limit(40),
    admin.from("lead_voice_notes")
      .select("summary, transcript, created_at")
      .eq("contact_id", contactId)
      .order("created_at", { ascending: true }).limit(20),
  ]);

  const callBlock = (calls ?? [])
    .map((x) => x.summary || (x.transcript ? String(x.transcript).slice(0, 600) : null))
    .filter(Boolean).slice(0, 16).map((s) => `- ${s}`).join("\n");
  const noteBlock = (notes ?? [])
    .map((x) => x.summary || (x.transcript ? String(x.transcript).slice(0, 400) : null))
    .filter(Boolean).slice(0, 12).map((s) => `- ${s}`).join("\n");

  // Nothing meaningful to learn from → skip (don't pollute the brain).
  if (!callBlock && !noteBlock && !c.notes) return false;

  const ctx =
    `Lead reached stage: ${stageLabel}${won ? " (BOOKED)" : " (not booked)"}.\n` +
    (c.budget ? `Budget: ${c.budget}. ` : "") +
    (c.site_visit_project ? `Project: ${c.site_visit_project}. ` : "") +
    (c.territory ? `Area: ${c.territory}.` : "") + "\n" +
    (c.notes ? `Rep notes: ${String(c.notes).slice(0, 500)}\n` : "") +
    `\nCall summaries:\n${callBlock || "(none)"}\n\nVoice-note summaries:\n${noteBlock || "(none)"}`;

  const out = await groqJson(lessonSystem(won, stageLabel), ctx, 0.4);
  const lesson = typeof out?.lesson === "string" ? out.lesson.trim() : "";
  if (!lesson || lesson.length < 15) return false;

  // The title is what a rep sees quoted back at them, so it says which of the
  // two this is. "Won:" is reserved for an actual booking.
  const title = won
    ? `Won: ${c.name ?? "lead"} → ${stageLabel}`
    : `Progress: ${c.name ?? "lead"} → ${stageLabel}`;
  // source_id keeps its historic `win:` prefix. It is only an idempotency key,
  // and rewriting it would orphan the 28 chunks already harvested under it —
  // every one of them would be re-harvested as a duplicate.
  const sourceId = `win:${contactId}`;
  // Idempotent: replace any earlier harvest for this lead.
  await admin.from("knowledge_chunks").delete()
    .eq("source_id", sourceId).eq("company_id", c.company_id);

  try {
    const embedding = await embedModel.run(lesson.slice(0, 1200), { mean_pool: true, normalize: true });
    const { error } = await admin.from("knowledge_chunks").insert({
      company_id: c.company_id, source_kind: won ? "win" : "progress", source_id: sourceId,
      title, content: lesson, embedding,
    });
    return !error;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const auth = req.headers.get("Authorization") ?? "";
  const bearer = auth.replace(/^Bearer\s+/i, "").trim();
  const admin = createClient(SUPABASE_URL, SERVICE);
  const body = await req.json().catch(() => ({} as Record<string, unknown>));

  // ---- Service scan: harvest recently-won leads that have no win yet. ----
  if (bearer === SERVICE) {
    if (body.mode !== "scan") return json({ ok: false, error: "unknown service mode" }, 400);
    const limit = Math.min(Math.max(Number(body.limit) || 20, 1), 60);
    // Leads in a won stage whose win hasn't been harvested (left-join is awkward
    // over a text source_id, so fetch candidates then filter by existing wins).
    const { data: cands } = await admin.from("contacts")
      .select("id")
      .in("status", LEARNABLE)
      .order("last_contacted_at", { ascending: false, nullsFirst: false })
      .limit(limit * 4);
    const ids = (cands ?? []).map((r) => r.id as string);
    if (ids.length === 0) return json({ ok: true, harvested: 0, remaining: 0 });

    const { data: existing } = await admin.from("knowledge_chunks")
      // Both kinds — a lead already harvested as 'progress' must not be
      // harvested again just because it is no longer filed under 'win'.
      .select("source_id").in("source_kind", ["win", "progress"])
      .in("source_id", ids.map((id) => `win:${id}`));
    const have = new Set((existing ?? []).map((r) => String(r.source_id)));
    const todo = ids.filter((id) => !have.has(`win:${id}`)).slice(0, limit);

    let harvested = 0;
    for (const id of todo) {
      const ok = await harvestOne(admin, id).catch(() => false);
      if (ok) harvested++;
    }
    return json({ ok: true, harvested, scanned: todo.length });
  }

  // ---- Rep / admin: harvest one lead right now (e.g. just marked booked). ----
  const u = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
  const { data: ud } = await u.auth.getUser();
  if (!ud?.user) return json({ ok: false, error: "Unauthorized" }, 401);

  const contactId = String(body.contact_id ?? "").trim();
  if (!contactId) return json({ ok: false, error: "contact_id required" }, 400);
  // RLS check: the caller must be able to see this lead (their company).
  const { data: seen } = await u.from("contacts").select("id").eq("id", contactId).maybeSingle();
  if (!seen) return json({ ok: false, error: "Not found" }, 404);

  const ok = await harvestOne(admin, contactId).catch(() => false);
  return json({ ok: true, harvested: ok ? 1 : 0 });
});
