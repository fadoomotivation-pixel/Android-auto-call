// What the telecaller said she would do, and whether she did it.
//
// THE NUMBER THAT MADE THIS EXIST
//
//   217 leads had a real recorded conversation
//    82 talked about a SITE VISIT on that call
//    11 ever reached the site-visit stage
//    70 of the 82 got ZERO WhatsApp after that call — no address, no photo,
//       no "Sunday 11 baje theek hai?"
//
// The buyer said yes and then nobody followed through. No CRM on earth catches
// that, because catching it means holding the RECORDING (what was promised),
// the WHATSAPP (whether it was delivered) and the LEAD (whether it moved) in
// one place. This product already does. Nothing was reading them together.
//
// THE DIVISION OF LABOUR, AND IT IS THE WHOLE DESIGN
//
//   this function     reads the transcript and records what was PROMISED
//   settle_promises() reads WhatsApp, later calls and site_visit_at to decide
//                     what was DONE
//
// No model ever judges whether a rep did her job. The model only reports what
// it heard her say, with her own words attached, and plain SQL — which anyone
// can re-run — decides the rest. That split is what makes this safe to show a
// founder.
//
// Modes:
//   POST { mode:"scan", limit } (service key) → read N unread recordings
//   POST { contact_id }         (rep/admin JWT) → read this lead's recent calls
//
// BATCHED, like lead-memory and knowledge-ingest: a transcript is up to 6,000
// characters and a greedy batch is what returns HTTP 546 from the edge CPU
// budget. The caller loops while `more` is true.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GROQ = Deno.env.get("GROQ_API_KEY") ?? "";
/**
 * A CHAIN, NOT A NAME — AND THIS IS NOT DEFENSIVE PROGRAMMING, IT IS A SCAR.
 *
 * The first real run of this job came back "failed 6". The reason, once the
 * error was actually surfaced, was:
 *
 *   groq 404: The model `llama-3.3-70b-versatile` does not exist or you do
 *   not have access to it.
 *
 * That string is hardcoded in twenty-one places across this repository. Every
 * AI feature in the product — the coach, the summaries, the win harvest, the
 * morning five — had been calling a model that no longer exists, catching the
 * failure, returning null, and saying nothing. coach_briefs stopped on 12
 * September and nobody was told, because silence and success look identical
 * from outside a try/catch.
 *
 * So: a list, tried in order, with the first one that answers remembered for
 * the life of the instance. GROQ_MODEL still wins when it is set, so the fix
 * for the next retirement is one environment variable and no deploy at all.
 */
const MODEL_CHAIN: string[] = [
  ...(Deno.env.get("GROQ_MODEL") ?? "").split(",").map((m) => m.trim()).filter(Boolean),
  // Verified live on this account on 20 Sep 2026 by asking Groq
  // (mode:"models"), in that order — not copied from a blog post.
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "qwen/qwen3.8-27b",
];
/** The one that answered, so the chain is walked once per instance and not
 *  once per transcript. */
let liveModel: string | null = null;

/** Below this a transcript is a ring-out, not a conversation — nobody promises
 *  anything in eleven seconds. Same floor lead-memory uses, measured the same
 *  way: 722 of 3,158 transcripts on this platform clear it. */
const REAL_TALK = 400;

/**
 * How long the rep gets before the app says a word about it.
 *
 * A window, not a stopwatch. The point is never to catch someone out at 4:55pm
 * — it is that a floor plan promised on Tuesday and still not sent on Thursday
 * is a lead quietly dying. Sending something is a same-day job; getting a visit
 * into the diary takes a call back and a family conversation, so it gets two.
 */
const WINDOW_HOURS: Record<string, number> = {
  send: 24,
  price_check: 24,
  visit: 48,
};

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

/**
 * WRITTEN TO MAKE FINDING NOTHING EASY.
 *
 * Every row this produces is, in effect, an accusation: it will put a lead back
 * in a telecaller's Call now list and it will be counted in her founder's 7pm
 * report. A promise the model imagines is therefore not a bad output, it is a
 * false charge against a named person — so "no promises" is stated as the
 * correct and expected answer, twice, and every promise must carry the rep's
 * own words or it is thrown away on the way in.
 *
 * The transcripts are Devanagari ASR of Hindi/Hinglish phone calls and they are
 * ROUGH — words are mangled, the two speakers are not labelled. The model is
 * told that plainly, because a model that assumes a clean transcript will read
 * confidence into noise.
 */
const SYSTEM =
  "You are reading the transcript of ONE phone call between an Indian real-estate telecaller (the REP) and a " +
  "customer (the BUYER). It is automatic speech recognition of Hindi/Hinglish, usually in Devanagari script, and " +
  "it is ROUGH: words are misheard and the speakers are NOT labelled. Work out who is speaking from the sense of " +
  "the conversation.\n" +
  "Your ONLY job: list what the REP committed to DO AFTER the call. Not what the buyer wanted, not what was " +
  "discussed — what the rep said she would do.\n" +
  'Reply ONLY as JSON: {"promises": [{"kind": string, "promise": string, "quote": string}]}\n' +
  "kind must be exactly one of:\n" +
  "  send         she will send something — photos, floor plan, price list, brochure, location, video\n" +
  "  visit        a site visit or office visit was agreed, or she said she would arrange/fix one\n" +
  "  price_check  she will check something and come back — rate, discount, availability, loan, manager approval\n" +
  "promise: max ~10 words, simple everyday English a telecaller reads at a glance. Name the thing. " +
  "Examples: 'Send 2BHK floor plan and price', 'Fix Sunday site visit', 'Check best rate with manager'.\n" +
  "quote: the rep's own words from the transcript that prove it, copied as they appear, max 25 words.\n" +
  "The transcriber mishears 'site visit' as 'साइड विजिट' or 'side visit' — that is a SITE visit, and the " +
  "promise text must say so even though the quote keeps whatever was actually transcribed.\n" +
  "AT MOST 3 promises, and at most ONE of each kind.\n" +
  "RETURN AN EMPTY LIST WHEN THERE IS NOTHING. Most calls contain no promise at all, and an empty list is a " +
  "correct, useful answer. Do NOT count: pleasantries, 'ji theek hai', the buyer promising something, a vague " +
  "'dekhte hain', or anything you inferred rather than heard. If the transcript is too garbled to be sure who " +
  "said what, return an empty list. A promise you invent is blamed on a real telecaller by name, so when in " +
  "doubt, leave it out.";

type Candidate = {
  call_id: string;
  contact_id: string;
  company_id: string;
  salesperson_id: string | null;
  started_at: string;
};

type Found = { kind: string; promise: string; quote: string };

/**
 * WHY THIS RETURNS THE REASON AND NOT JUST null.
 *
 * The first version swallowed every failure into `null`, so the first real run
 * came back "considered 6, read 0, failed 6" and said nothing about why. That
 * is the same mistake the WhatsApp worker's heartbeat made — a dropped link
 * and a dead box reported identically, and it cost two wrong diagnoses. A
 * batch job nobody watches must say what went wrong in its own response.
 */
async function askOnce(
  model: string,
  system: string,
  user: string,
): Promise<{ data: Record<string, unknown> | null; error: string | null; gone: boolean }> {
  try {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${GROQ}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
      }),
    });
    const j = await r.json().catch(() => null) as Record<string, unknown> | null;
    if (!r.ok) {
      const e = String((j?.error as Record<string, unknown> | undefined)?.message ?? "");
      // 404 or "does not exist" means THIS model is gone — try the next one.
      // A 429 or a 500 means Groq is busy, and walking the chain would just
      // hammer them with the same request under four different names.
      const gone = r.status === 404 || /does not exist|decommissioned|not found/i.test(e);
      return { data: null, error: `groq ${r.status} on ${model}: ${e.slice(0, 140)}`, gone };
    }
    const raw = (j as { choices?: { message?: { content?: string } }[] })
      ?.choices?.[0]?.message?.content ?? "";
    if (!raw) return { data: null, error: `empty message from ${model}`, gone: false };
    try {
      return { data: JSON.parse(raw), error: null, gone: false };
    } catch {
      return { data: null, error: `unparseable JSON: ${raw.slice(0, 120)}`, gone: false };
    }
  } catch (e) {
    return { data: null, error: String(e).slice(0, 160), gone: false };
  }
}

/**
 * WHY THIS RETURNS THE REASON AND NOT JUST null.
 *
 * The first version swallowed every failure into `null`, so the first real run
 * came back "considered 6, read 0, failed 6" and said nothing about why — and
 * the why turned out to be a platform-wide outage nobody knew about. That is
 * the same mistake the WhatsApp worker's heartbeat made: a dropped link and a
 * dead box reported identically, and it cost two wrong diagnoses. A batch job
 * nobody watches must say what went wrong in its own response.
 */
async function groqJson(
  system: string,
  user: string,
): Promise<{ data: Record<string, unknown> | null; error: string | null }> {
  if (!GROQ) return { data: null, error: "no GROQ_API_KEY" };

  if (liveModel) {
    const r = await askOnce(liveModel, system, user);
    if (!r.gone) return { data: r.data, error: r.error };
    liveModel = null; // it was retired mid-run; fall through and find another
  }

  let last: string | null = null;
  for (const model of MODEL_CHAIN) {
    const r = await askOnce(model, system, user);
    if (!r.gone) {
      if (!r.error) liveModel = model;
      return { data: r.data, error: r.error };
    }
    last = r.error;
  }
  return { data: null, error: `no usable Groq model. Last: ${last ?? "unknown"}` };
}

/** Everything that keeps a hallucination out of the table. */
function clean(out: Record<string, unknown> | null): Found[] {
  const list = Array.isArray(out?.promises) ? out!.promises : [];
  const seen = new Set<string>();
  const kept: Found[] = [];
  for (const raw of list) {
    const p = raw as Record<string, unknown>;
    const kind = String(p?.kind ?? "").trim().toLowerCase();
    const promise = String(p?.promise ?? "").trim().slice(0, 120);
    const quote = String(p?.quote ?? "").trim().slice(0, 240);
    if (!(kind in WINDOW_HOURS)) continue;
    // NO WORDS, NO ROW. The quote is the only thing standing between this
    // feature and a telecaller being told she broke a promise she never made,
    // so a promise that cannot be evidenced does not get stored at all.
    if (!promise || quote.length < 4) continue;
    if (seen.has(kind)) continue;
    seen.add(kind);
    kept.push({ kind, promise, quote });
    if (kept.length >= 3) break;
  }
  return kept;
}

/** Read one recording. Returns the number stored, or the reason it could not
 *  be read — a call that failed must NOT be marked scanned, or one bad
 *  afternoon would silently skip a day of recordings forever. */
async function readCall(
  admin: SupabaseClient,
  c: Candidate,
): Promise<{ stored: number; error: string | null }> {
  const { data: call } = await admin.from("call_logs")
    .select("transcript, duration_seconds")
    .eq("id", c.call_id).maybeSingle();

  const transcript = String(call?.transcript ?? "");
  let found: Found[] = [];

  if (transcript.length >= REAL_TALK) {
    // 6,000 characters is roughly a fifteen-minute call. Cutting the START
    // would be wrong — the middle of a property call is where "main bhej deta
    // hoon" lives — so a rare longer call loses only its tail.
    const out = await groqJson(SYSTEM, `Call transcript:\n${transcript.slice(0, 6000)}`);
    if (out.error) return { stored: 0, error: out.error };
    found = clean(out.data);
  }

  if (found.length) {
    const said = c.started_at;
    const rows = found.map((f) => ({
      company_id: c.company_id,
      contact_id: c.contact_id,
      salesperson_id: c.salesperson_id,
      call_id: c.call_id,
      kind: f.kind,
      promise: f.promise,
      quote: f.quote,
      said_at: said,
      due_by: new Date(new Date(said).getTime() + WINDOW_HOURS[f.kind] * 3600_000).toISOString(),
      status: "open",
    }));
    // ignoreDuplicates: a re-read of the same call must never double-charge a
    // rep for one sentence.
    await admin.from("lead_promises").upsert(rows, { onConflict: "call_id,kind", ignoreDuplicates: true });
  }

  await admin.from("promise_scans")
    .upsert({ call_id: c.call_id, scanned_at: new Date().toISOString(), found: found.length },
            { onConflict: "call_id" });

  return { stored: found.length, error: null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!GROQ) return json({ error: "GROQ_API_KEY not configured" }, 503);

  const auth = req.headers.get("Authorization") ?? "";
  const bearer = auth.replace(/^Bearer\s+/i, "").trim();
  const admin = createClient(SUPABASE_URL, SERVICE);
  const body = await req.json().catch(() => ({} as Record<string, unknown>));

  // ── batch, for the cron ────────────────────────────────────────────────
  // WHICH MODELS THIS ACCOUNT CAN ACTUALLY USE.
  //
  // One call, service-key only. Had this existed on 12 September, the answer
  // to "why has the AI gone quiet" would have taken thirty seconds instead of
  // a fortnight of nobody noticing.
  if (body?.mode === "models") {
    if (bearer !== SERVICE) return json({ error: "service key required" }, 401);
    const r = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { Authorization: `Bearer ${GROQ}` },
    });
    const j = await r.json().catch(() => null) as { data?: { id?: string }[] } | null;
    return json({
      ok: r.ok,
      status: r.status,
      models: (j?.data ?? []).map((m) => m.id).filter(Boolean).sort(),
      chain: MODEL_CHAIN,
    });
  }

  if (body?.mode === "scan") {
    if (bearer !== SERVICE) return json({ error: "service key required" }, 401);
    const limit = Math.min(Number(body.limit ?? 12), 25);

    const { data: rows, error } = await admin.rpc("promise_candidates", { p_limit: limit });
    if (error) return json({ error: error.message }, 500);

    let stored = 0, read = 0, failed = 0;
    let firstError: string | null = null;
    for (const r of (rows ?? []) as Candidate[]) {
      const n = await readCall(admin, r);
      if (n.error) { failed += 1; firstError ??= n.error; continue; }
      read += 1;
      stored += n.stored;
    }

    // SETTLE EVERY TIME, not on a clock of its own. A promise made on a call
    // three weeks ago is very often already kept — the rep did send the floor
    // plan — and storing it as "open" for even an hour would put a lead the
    // rep has already handled back in her Call now list. The table is small and
    // this is four indexed statements.
    const { data: settled } = await admin.rpc("settle_promises");

    return json({
      ok: true,
      considered: (rows ?? []).length,
      read, stored, failed,
      // Named, not counted. "failed: 6" with no reason is what sent the first
      // run of this job back with nothing to act on.
      ...(firstError ? { error: firstError } : {}),
      settled: Number(settled ?? 0),
      more: (rows ?? []).length >= limit,
    });
  }

  // ── one lead, asked for by a person ────────────────────────────────────
  const contactId = String(body?.contact_id ?? "");
  if (!contactId) return json({ error: "contact_id required" }, 400);

  const u = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
  const { data: ud } = await u.auth.getUser();
  if (!ud?.user) return json({ error: "sign in first" }, 401);
  // RLS answers "may this person see this lead". An empty select means no.
  const { data: seen } = await u.from("contacts")
    .select("id, company_id, salesperson_id").eq("id", contactId).maybeSingle();
  if (!seen) return json({ error: "not your lead" }, 403);

  const { data: calls } = await admin.from("call_logs")
    .select("id, started_at")
    .eq("contact_id", contactId)
    .eq("off_crm", false)
    .not("transcript", "is", null)
    .order("started_at", { ascending: false })
    .limit(3);

  let stored = 0;
  for (const call of calls ?? []) {
    const n = await readCall(admin, {
      call_id: call.id,
      contact_id: contactId,
      company_id: seen.company_id,
      salesperson_id: seen.salesperson_id ?? null,
      started_at: call.started_at,
    });
    stored += n.stored;
  }
  const { data: settled } = await admin.rpc("settle_promises");
  return json({ ok: true, stored, settled: Number(settled ?? 0) });
});
