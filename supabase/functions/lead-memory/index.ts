// What was actually said, and where it stopped.
//
// This company has 594 real conversations recorded and zero bookings. 120 of
// those conversations ended with the lead sitting in "contacted" or "lost",
// averaging 1,180 characters of transcript — a buyer saying what they wanted
// and what was stopping them, out loud, filed somewhere nobody will ever look.
//
// The founder cannot listen to 120 recordings. The rep cannot remember a
// conversation from three weeks ago across 83 leads. So this reads them once,
// per lead, and distils four things:
//
//   where_we_left_it  the thread to pick up, in the rep's own language
//   buyer_wants       what they asked for, in theirs
//   objection         the one thing that stopped it, quoted
//   objection_code    the same thing, countable
//
// IT READS BOTH CHANNELS, WHICH IS THE POINT. A buyer says the polite version
// on the phone and the real version on WhatsApp at 11pm — "rate thoda zyada
// lag raha hai" only ever gets typed. Reading one without the other gets half
// the story, and until now every AI in this product read only the calls.
//
// Nothing here adds a screen. The memory is consumed by things that already
// exist: focus-five writes a better opener, the Daily Pulse can finally count
// why deals die, and the shared brain gets the objections that were handled
// well. See migration 0209.
//
// Modes:
//   POST { contact_id }               (rep/admin JWT)  → one lead, now.
//   POST { mode:"scan", limit, offset } (service key)  → batch, newest material
//                                                        first, skips leads
//                                                        already up to date.
//
// BATCHED for the same reason knowledge-ingest is: a whole company at once
// blew the edge CPU budget and returned HTTP 546. The caller loops until
// `done`.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GROQ = Deno.env.get("GROQ_API_KEY") ?? "";

/** A transcript shorter than this is a ring-out, not a conversation. Measured:
 *  of 3,158 transcripts on this platform, 594 clear 400 characters and the
 *  rest are "hello… hello?". Harvesting those teaches the brain nothing and
 *  costs a model call each. */
const REAL_TALK = 400;

const OBJECTIONS = [
  "price", "loan", "location", "size", "timing", "family",
  "competitor", "not_serious", "other", "none",
] as const;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

async function groqJson(system: string, user: string): Promise<Record<string, unknown> | null> {
  if (!GROQ) return null;
  try {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${GROQ}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: (Deno.env.get("GROQ_MODEL") ?? "openai/gpt-oss-120b"), temperature: 0.2,
        response_format: { type: "json_object" },
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
 * The prompt is written to make INVENTING harder than admitting ignorance.
 *
 * A model handed a thin transcript will cheerfully produce a confident
 * objection that nobody said, and that objection would then be counted in the
 * founder's tally and spoken out loud by the rep on the next call. Both of
 * those are worse than an empty row, so "none" and "" are named as correct
 * answers and the model is told twice not to fill gaps.
 */
const SYSTEM =
  "You are reading one real-estate lead's whole history with a telecaller: call transcripts and WhatsApp " +
  "messages, in Hindi, English or Hinglish. Understand all three.\n" +
  'Reply ONLY as JSON: {"where_we_left_it": string, "buyer_wants": string, "objection": string, "objection_code": string}.\n' +
  "where_we_left_it: ONE sentence, max ~25 words, simple Roman Indian English, written FOR THE REP so she can ring " +
  "this person today and pick up the thread. Name the project, the unit, the number or the promise if it was said. " +
  "Example: 'Balaji me 2BHK dekha, 25L budget bola, rate pe ruke — aapne manager se baat karne ko kaha tha.'\n" +
  "buyer_wants: max ~12 words, what THEY asked for. '' if they never said.\n" +
  "objection: the one thing that stopped it, quoted or closely paraphrased from what the BUYER said. '' if they " +
  "never raised one.\n" +
  "objection_code: exactly one of price, loan, location, size, timing, family, competitor, not_serious, other, none. " +
  "Use 'none' when no objection was raised, and 'not_serious' only when the buyer plainly was not a buyer.\n" +
  "NEVER invent a detail, a number, a project name or an objection that is not in the material. If the material is " +
  "too thin to say, return empty strings and objection_code 'none'. An empty answer is correct and useful; a " +
  "confident guess is not, because a founder will count it and a rep will say it out loud.";

type Row = { contact_id: string; company_id: string; salesperson_id: string | null };

/** Distil one lead. Returns true when a memory was written. */
async function harvestOne(admin: SupabaseClient, contactId: string): Promise<boolean> {
  const { data: c } = await admin.from("contacts")
    .select("id, company_id, salesperson_id, name, budget, territory, site_visit_project, stage, status")
    .eq("id", contactId).maybeSingle();
  if (!c?.company_id) return false;

  const [{ data: calls }, { data: wa }] = await Promise.all([
    admin.from("call_logs")
      .select("transcript, summary, started_at, duration_seconds")
      .eq("contact_id", contactId)
      .order("started_at", { ascending: true }).limit(30),
    // BOTH SIDES OF THE WHATSAPP, and that is deliberate. The rep's own
    // messages are what she promised; the buyer's are what they actually want.
    // Reading only one of them produces advice about half a conversation.
    admin.from("wa_observed_messages")
      .select("direction, body, media_kind, sent_at")
      .eq("contact_id", contactId).is("archived_at", null)
      .not("body", "is", null)
      .order("sent_at", { ascending: true }).limit(120),
  ]);

  const callRows = (calls ?? []).filter((x) =>
    (x.transcript && String(x.transcript).length >= REAL_TALK) || x.summary);
  const waRows = (wa ?? []).filter((x) => String(x.body ?? "").trim().length > 1);

  // Nothing worth a model call. Not an error — most leads are ring-outs.
  if (callRows.length === 0 && waRows.length < 3) return false;

  // Only re-harvest when there is something newer than last time. A nightly
  // scan over a company must cost nothing on a lead that has not moved.
  const newest = [
    ...callRows.map((x) => String(x.started_at ?? "")),
    ...waRows.map((x) => String(x.sent_at ?? "")),
  ].filter(Boolean).sort().at(-1) ?? null;

  const { data: prev } = await admin.from("lead_memory")
    .select("material_at").eq("contact_id", contactId).maybeSingle();
  if (prev?.material_at && newest && new Date(prev.material_at) >= new Date(newest)) return false;

  const callBlock = callRows.slice(-10).map((x) => {
    const when = String(x.started_at ?? "").slice(0, 10);
    const body = x.transcript && String(x.transcript).length >= REAL_TALK
      ? String(x.transcript).slice(0, 1500)
      : String(x.summary ?? "");
    return `[call ${when}] ${body}`;
  }).join("\n");

  const waBlock = waRows.slice(-60).map((x) => {
    const who = x.direction === "in" ? "BUYER" : "REP";
    const when = String(x.sent_at ?? "").slice(0, 10);
    const what = x.media_kind && !String(x.body ?? "").trim()
      ? `(sent a ${x.media_kind})`
      : String(x.body ?? "").slice(0, 300);
    return `[${who} ${when}] ${what}`;
  }).join("\n");

  const ctx =
    `Lead: ${c.name ?? "unnamed"}. Stage: ${c.stage}. Status: ${c.status}.\n` +
    (c.budget ? `Budget on file: ${c.budget}. ` : "") +
    (c.site_visit_project ? `Project: ${c.site_visit_project}. ` : "") +
    (c.territory ? `Area: ${c.territory}.` : "") + "\n\n" +
    `CALLS:\n${callBlock || "(none worth reading)"}\n\nWHATSAPP:\n${waBlock || "(none)"}`;

  const out = await groqJson(SYSTEM, ctx);
  if (!out) return false;

  const str = (k: string, max: number) => {
    const v = out[k];
    return typeof v === "string" ? v.trim().slice(0, max) : "";
  };
  const where = str("where_we_left_it", 300);
  const wants = str("buyer_wants", 160);
  const obj = str("objection", 300);
  let code = str("objection_code", 20).toLowerCase();
  if (!(OBJECTIONS as readonly string[]).includes(code)) code = obj ? "other" : "none";
  // A code without the words behind it is a number nobody can check. Both or
  // neither.
  if (!obj) code = "none";

  // The model had nothing to say and said so. Correct, and not worth a row.
  if (!where && !wants && !obj) return false;

  const { error } = await admin.from("lead_memory").upsert({
    contact_id: contactId,
    company_id: c.company_id,
    salesperson_id: c.salesperson_id ?? null,
    where_we_left_it: where || null,
    buyer_wants: wants || null,
    objection: obj || null,
    objection_code: code,
    material_at: newest,
    sources: { calls: callRows.length, whatsapp: waRows.length },
    generated_at: new Date().toISOString(),
  }, { onConflict: "contact_id" });

  return !error;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const auth = req.headers.get("Authorization") ?? "";
  const bearer = auth.replace(/^Bearer\s+/i, "").trim();
  const admin = createClient(SUPABASE_URL, SERVICE);
  const body = await req.json().catch(() => ({} as Record<string, unknown>));

  if (!GROQ) return json({ error: "GROQ_API_KEY not configured" }, 503);

  // ── batch, for the cron ────────────────────────────────────────────────
  if (body?.mode === "scan") {
    if (bearer !== SERVICE) return json({ error: "service key required" }, 401);
    const limit = Math.min(Number(body.limit ?? 12), 25);

    // Leads that HAD a real conversation, newest material first. The ones
    // worth reading before the ones that merely exist.
    const { data: rows, error } = await admin.rpc("lead_memory_candidates", { p_limit: limit });
    if (error) return json({ error: error.message }, 500);

    let done = 0;
    for (const r of (rows ?? []) as Row[]) {
      if (await harvestOne(admin, r.contact_id)) done += 1;
    }
    return json({ ok: true, considered: (rows ?? []).length, stored: done, more: (rows ?? []).length >= limit });
  }

  // ── one lead, asked for by a person ────────────────────────────────────
  const contactId = String(body?.contact_id ?? "");
  if (!contactId) return json({ error: "contact_id required" }, 400);

  const u = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
  const { data: ud } = await u.auth.getUser();
  if (!ud?.user) return json({ error: "sign in first" }, 401);
  // RLS decides whether this person may see the lead at all; if the select
  // comes back empty they may not, and there is nothing to harvest for them.
  const { data: seen } = await u.from("contacts").select("id").eq("id", contactId).maybeSingle();
  if (!seen) return json({ error: "not your lead" }, 403);

  const ok = await harvestOne(admin, contactId);
  return json({ ok, stored: ok ? 1 : 0 });
});
