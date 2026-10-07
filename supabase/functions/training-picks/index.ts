// training-picks — read the good calls and say what a fresher should learn.
//
// Body: { company_id?, offset?, batch?, force?, mode? }
// Returns: { ok, scored, skipped, done, next_offset, remaining, model, errors }
//
// WHY A MODEL HAS TO READ THESE AT ALL
//
// v_training_library can already rank calls, and its ranking is defensible:
// where the lead ended up, whether it moved in the fortnight after, how much
// was said. But every one of those is CIRCUMSTANCE. None of them can tell a
// call where the rep handled an objection cleanly from a call where the buyer
// had already decided and the rep got out of the way. A fresher listening to
// the second one learns nothing and does not know it.
//
// So this reads the transcript and answers the only question that matters:
// what would a new telecaller actually take away from twenty minutes with
// this recording — and it is allowed to answer "nothing".
//
// BATCHED, AND NOT BY PREFERENCE
//
// knowledge-ingest learned this the expensive way: a whole book in one request
// blew the edge CPU budget and returned HTTP 546. One Groq call per candidate
// means `batch` candidates is `batch` round trips, so the default is small and
// the client loops on next_offset until done. Raising batch past 8 is how this
// starts failing in a way that looks like the model being down.
//
// HONEST SCORES OR THIS IS WORTHLESS
//
// The scale is 1-5 and 1 and 2 are expected outcomes, not failure states. A
// library where everything scores 4 is a list sorted by nothing, and the
// founder will find that out on the third recording and stop opening the page.
// The transcripts are Devanagari ASR and some are genuinely unreadable; the
// prompt says so and tells the model to score those 1 rather than invent a
// lesson from noise.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { groqJson, currentModel } from "../_shared/groq.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(o: unknown, s = 200) {
  return new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/** One Groq round trip per candidate, so this stays small. See the header. */
const DEFAULT_BATCH = 4;
const MAX_BATCH = 8;

/** Whisper on a five-minute Hindi call produces around 2,500 characters. This
 *  is generous enough to hold the whole of almost every candidate and short
 *  enough that a rare outlier cannot blow the context. */
const TRANSCRIPT_CAP = 7000;

const SKILLS = ["opening", "listening", "objection", "price", "site_visit", "closing"];

const SYSTEM = `You train new real-estate telecallers in India.

You are given ONE call: how long it was, what stage the lead reached, and an
automatic transcript. The transcript is machine-made from Hindi/Hinglish speech
and is often wrong — words are garbled, names are mangled, and whole sentences
can be nonsense. Read through that where you can.

Decide what a NEW telecaller, on her first week, would actually learn from
hearing this recording.

Score 1 to 5. Use the whole scale honestly:
  5  a model call. She should copy how this was done.
  4  clearly worth hearing; one or two things done well.
  3  ordinary. Shows the job being done, teaches little.
  2  weak. She would pick up a habit worth avoiding.
  1  useless as training — or the transcript is too garbled to tell what
     happened. Say which, in "why".

Most calls are 2 or 3. If you find yourself giving 4 to everything, you are
not reading them.

Reply ONLY with JSON:
{"score":1-5,"skill":"opening|listening|objection|price|site_visit|closing|null",
 "why":"one sentence, max 20 words",
 "listen_for":"what to wait for while it plays, max 15 words, or null"}

RULES
- "why" and "listen_for" are read by a telecaller. Simple everyday English.
  Short words. No Hindi, no jargon, no praise that says nothing.
- Describe only what is IN the transcript. Never invent a moment, a price, a
  project name or an objection that is not there.
- If the transcript is unreadable: score 1, skill null, why says the recording
  could not be read, listen_for null.
- "listen_for" names a moment, not a summary. "How she answers the price
  question without dropping the rate" — not "good negotiation skills".`;

type Verdict = { score?: number; skill?: string | null; why?: string; listen_for?: string | null };

function clean(s: unknown, max: number): string | null {
  if (typeof s !== "string") return null;
  const t = s.trim();
  if (!t || t.toLowerCase() === "null") return null;
  return t.slice(0, max);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const auth = req.headers.get("Authorization") ?? "";
  const bearer = auth.replace(/^Bearer\s+/i, "").trim();
  const isService = bearer === SERVICE;
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;

  const mode = String(body.mode ?? "");
  const dryRun = mode === "dry_run";
  const force = body.force === true;
  const offset = Math.max(0, Number(body.offset ?? 0) | 0);
  const batch = Math.min(MAX_BATCH, Math.max(1, Number(body.batch ?? DEFAULT_BATCH) | 0));

  // ── Who is asking, and which company they may score ──────────────────────
  //
  // Reads go through the CALLER's client, not the service role. The library
  // view is security_invoker and call_logs carries its own RLS, so a company
  // admin physically cannot pull another tenant's transcript through here.
  // The service role appears only to write the verdict back.
  let isSuper = false;
  let scopeCompany: string | null = null;
  const u = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });

  if (isService) {
    isSuper = true;
    scopeCompany = (body.company_id as string) ?? null;
  } else {
    const { data: ud } = await u.auth.getUser();
    if (!ud?.user) return json({ ok: false, error: "Unauthorized" }, 401);
    const [{ data: prof }, { data: pa }] = await Promise.all([
      u.from("profiles").select("role, company_id").eq("id", ud.user.id).maybeSingle(),
      u.from("platform_admins").select("user_id").eq("user_id", ud.user.id).maybeSingle(),
    ]);
    isSuper = !!pa;
    if (prof?.role !== "admin" && !isSuper) return json({ ok: false, error: "Admins only." }, 403);
    // A company admin is pinned to their own company whatever they ask for.
    // Only the super admin may pass company_id, and null means all of them.
    scopeCompany = isSuper
      ? ((body.company_id as string) ?? null)
      : ((prof?.company_id as string) ?? null);
    if (!isSuper && !scopeCompany) return json({ ok: false, error: "No company on this profile." }, 403);
  }

  // ── The candidates, best-circumstance first ──────────────────────────────
  let q = u.from("v_training_library")
    .select("call_id, company_id, lead_name, stage_label, duration_seconds, score, score_base")
    .order("score_base", { ascending: false });
  if (scopeCompany) q = q.eq("company_id", scopeCompany);
  if (!force) q = q.is("score", null);

  const { data: rows, error: readErr } = await q.range(offset, offset + batch - 1);
  if (readErr) return json({ ok: false, error: `library read failed: ${readErr.message}` }, 500);

  const candidates = rows ?? [];
  if (candidates.length === 0) {
    return json({ ok: true, scored: 0, skipped: 0, done: true, next_offset: offset, remaining: 0, errors: [] });
  }

  const admin = createClient(SUPABASE_URL, SERVICE);
  const errors: string[] = [];
  const results: unknown[] = [];
  let scored = 0;
  let skipped = 0;

  for (const c of candidates) {
    const callId = c.call_id as string;
    // The transcript is NOT in the view — a page that lists training calls has
    // no business pulling whole conversations down with it. Fetched here, one
    // at a time, through the caller's own client.
    const { data: call } = await u.from("call_logs")
      .select("transcript").eq("id", callId).maybeSingle();
    const transcript = (call?.transcript as string | null)?.trim() ?? "";
    if (transcript.length < 200) { skipped++; continue; }

    const user = [
      `Call length: ${Math.round(Number(c.duration_seconds ?? 0) / 60)} min ${Number(c.duration_seconds ?? 0) % 60} sec`,
      `Lead reached stage: ${c.stage_label ?? "unknown"}`,
      "",
      "Transcript (automatic, Hindi/Hinglish, may be garbled):",
      transcript.slice(0, TRANSCRIPT_CAP),
    ].join("\n");

    const r = await groqJson<Verdict>(SYSTEM, user, 0.2);
    if (!r.data) {
      // Surfaced, never swallowed. A silent null here is exactly how twenty-one
      // call sites sat dead for a fortnight.
      errors.push(`${callId}: ${r.error ?? "no verdict"}`);
      continue;
    }

    const raw = Number(r.data.score);
    const score = Number.isFinite(raw) ? Math.min(5, Math.max(1, Math.round(raw))) : null;
    if (score === null) { errors.push(`${callId}: no usable score`); continue; }

    const skillRaw = clean(r.data.skill, 20)?.toLowerCase() ?? null;
    const verdict = {
      call_id: callId,
      company_id: c.company_id as string,
      score,
      skill: skillRaw && SKILLS.includes(skillRaw) ? skillRaw : null,
      why: clean(r.data.why, 200),
      listen_for: clean(r.data.listen_for, 200),
      model: currentModel(),
    };

    if (dryRun) { results.push({ ...verdict, lead: c.lead_name }); scored++; continue; }

    const { error: wErr } = await admin.from("training_calls")
      .upsert({ ...verdict, scored_at: new Date().toISOString() }, { onConflict: "call_id" });
    if (wErr) { errors.push(`${callId}: write failed: ${wErr.message}`); continue; }
    scored++;
  }

  // How many are still waiting, so the caller knows whether to loop again and
  // the page can show real progress instead of a spinner with no end.
  let countQ = u.from("v_training_library").select("call_id", { count: "exact", head: true });
  if (scopeCompany) countQ = countQ.eq("company_id", scopeCompany);
  if (!force) countQ = countQ.is("score", null);
  const { count } = await countQ;
  const remaining = Math.max(0, (count ?? 0) - (force ? offset + candidates.length : 0));

  return json({
    ok: true,
    scored,
    skipped,
    // When not forcing, scored rows leave the unscored set, so the next pass
    // starts at 0 again. Forcing re-scores everything, so it has to walk.
    next_offset: force ? offset + candidates.length : 0,
    done: candidates.length < batch || remaining === 0,
    remaining,
    model: currentModel(),
    errors,
    ...(dryRun ? { dry_run: results } : {}),
  });
});
