// The AI twist on lead voice notes — now an assistant that ACTS:
// 1. Transcribes the telecaller's spoken note (Groq Whisper — Hindi/Hinglish OK)
// 2. Summarizes + suggests the lead's stage (see ../_shared/chat.ts)
// 3. AUTO-ACTIONS from what was said:
//    • "27 tarik ko site visit" → lead moves to Site Visit with that date, and
//      the rep gets reminders: day-before 10:00 IST ("Tomorrow is X's site
//      visit") + visit morning 08:30 IST ("Today is X's site visit")
//    • "parso 5 baje call karna" → a follow-up is scheduled + push at that time
//    • budget / hot-warm-cold mentioned → filled on the lead
//    Every action lands in the lead's Journey timeline as "AI Assistant".
// Body: { note_id }
// Auth: any signed-in user who can see the note (RLS), or the service role.
// Secret required: GROQ_API_KEY — used for Whisper transcription, which has its
// own quota and has never been the bottleneck.
// Optional: MISTRAL_API_KEY / GEMINI_API_KEY / CEREBRAS_API_KEY. The summarising
// step goes through ../_shared/chat.ts and falls through the whole chain; any
// may hold several comma-separated keys.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { chatJson } from "../_shared/chat.ts";
import { loadStages, stageOf, isPipeline, countsAsSale, DISPOSITIONS, type StageRow } from "../_shared/stage.ts";

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
// First Groq key only — Whisper transcription has its own quota and has never
// been the bottleneck. The summarising step uses the full chain via chat.ts.
const GROQ = (Deno.env.get("GROQ_API_KEY") ?? "").split(/[,\s]+/).filter(Boolean)[0] ?? "";

// DISPOSITIONS now comes from _shared/stage.ts — see the note there on why
// three copies of this list had drifted apart.

// India timezone helpers (the telecaller market runs on IST).
const IST_OFFSET_MS = 5.5 * 3600 * 1000;
function istToday(): { date: string; weekday: string } {
  const now = new Date(Date.now() + IST_OFFSET_MS);
  const date = now.toISOString().slice(0, 10);
  const weekday = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][now.getUTCDay()];
  return { date, weekday };
}
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
function istIso(date: string, time: string): string {
  return `${date}T${time}:00+05:30`;
}
function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function prettyIst(date: string, time?: string | null): string {
  const [y, m, d] = date.split("-").map(Number);
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  let s = `${d} ${MON[(m ?? 1) - 1]}`;
  if (time) {
    const [hh, mm] = time.split(":").map(Number);
    const h12 = ((hh + 11) % 12) + 1;
    s += `, ${h12}:${String(mm).padStart(2, "0")} ${hh < 12 ? "AM" : "PM"}`;
  }
  void y;
  return s;
}

function systemPrompt(): string {
  const { date, weekday } = istToday();
  return (
    "A real-estate telecaller has recorded a voice note, in their own words, " +
    "about how a call with a lead went. It may be Hindi, English or Hinglish. " +
    `Today is ${weekday}, ${date} (India). ` +
    'Reply ONLY with JSON: {"summary": string, "disposition": string, ' +
    '"site_visit_date": string|null, "site_visit_time": string|null, ' +
    '"site_visit_cancelled": boolean, ' +
    '"callback_date": string|null, "callback_time": string|null, ' +
    '"callback_requested": boolean, ' +
    '"budget": string|null, "temperature": string|null, "next_step": string|null, ' +
    '"customer_name": string|null, "token_amount": number|null, ' +
    '"alt_phone": string|null, "project": string|null, ' +
    '"connected": boolean, "phone_invalid": boolean, "facts": string[], ' +
    '"requirements": {"bhk": string|null, "size": string|null, ' +
    '"location": string|null, "purpose": string|null, "timeline": string|null, ' +
    '"loan_needed": boolean|null}}. ' +
    "summary: clear English, max ~80 words — outcome, the customer's intent/" +
    "objections, and the telecaller's next action. " +
    "disposition: the lead's CURRENT funnel stage after THIS call — pick the " +
    "single best of: 'interested' (keen, wants details), 'site_visit' (a visit " +
    "was agreed or planned), 'negotiation' (discussing price/loan/token), " +
    "'token_paid' (paid a booking token), 'booked' (deal closed/won), 'callback' " +
    "(asked to call later, OR the call did not connect — no answer, busy, phone " +
    "switched off, cut, not picked), 'not_interested' (customer clearly said NOT " +
    "interested after talking), 'lost', 'dnc' (customer said DO NOT call again). " +
    "IMPORTANT: a call that did not connect is 'callback', NEVER 'not_interested' " +
    "or 'dnc'. Use 'unknown' ONLY if the note is empty/a test with no signal. " +
    "site_visit_date: ONLY if the customer actually COMMITTED to visiting, " +
    'resolve phrases like "27 tarik", "agle Sunday", "parso" to YYYY-MM-DD ' +
    "(future). A maybe is not a booking: if they only might come " +
    "('shayad', 'dekhte hain', 'try karenge', 'sochkar batata hoon'), leave " +
    "this null and use disposition 'interested' instead. " +
    "site_visit_time: HH:MM 24h ONLY if a clock time was actually said. If they " +
    'just named a day ("Sunday visit", "do din me aayenge"), this is null — ' +
    "never guess a time. " +
    "site_visit_cancelled: true ONLY if the note says a planned visit is " +
    "cancelled/postponed indefinitely ('visit cancel ho gayi', 'nahi aa rahe'). " +
    "callback_date/callback_time: ONLY if the lead asked to be called back at " +
    "a specific day/time. callback_requested: true whenever a call-later was " +
    "asked EVEN IF no exact time was said ('baad me call karna', 'busy hoon'). " +
    "budget: as spoken (e.g. \"45L\", \"1.2 Cr\") or null. " +
    "customer_name: the customer's name if the telecaller SAYS it ('customer ka " +
    "naam Rakesh hai', 'Sharma ji bole…'), else null — never invent one. " +
    "token_amount: if a booking token/advance was PAID, the amount in plain " +
    "rupees as a number ('50 hazar token diya' → 50000, '2 lakh' → 200000); null otherwise. " +
    "alt_phone: a SECOND phone number spoken for THIS customer ('dusra number …', " +
    "'WhatsApp number alag hai'), digits as spoken; null unless clearly a phone number. " +
    "project: the project/site name the customer is interested in ('Gaur City wala', " +
    "'ABC Heights me 2BHK'); null if no project named. " +
    "temperature: ALWAYS rate the buyer's intent in this call — 'hot' (ready to " +
    "visit/book/negotiating, very keen), 'warm' (interested but needs time / will " +
    "discuss with family / comparing), or 'cold' (not interested, only enquiring, " +
    "no answer, or asked not to call). Use null only if there is truly no signal. " +
    "next_step: one short, concrete coaching line IN HINGLISH telling the telecaller " +
    "the smartest next move / how to handle the objection raised (e.g. \"Price zyada " +
    "bola — EMI aur payment-plan ka option samjhao\", \"Family se discuss karega — 2 din " +
    "baad follow-up aur brochure WhatsApp karo\"). null only if the call didn't connect. " +
    "connected: true if the telecaller ACTUALLY SPOKE with the customer on this " +
    "call; false if the call did NOT connect (switched off, no answer, busy, ringing " +
    "only, cut, not reachable, 'number band', 'uthaya nahi'). " +
    "phone_invalid: true ONLY when the number is GENUINELY WRONG / does not exist / " +
    "belongs to someone else ('galat number', 'aisa koi nahi', 'wrong person', 'kisi " +
    "aur ka number'). A phone that is merely SWITCHED OFF, busy, unreachable or not " +
    "picked is NOT phone_invalid — that is just a call that didn't connect (connected=false). " +
    "facts: 0-3 SHORT lines (each ≤80 chars, Hinglish OK) for any " +
    "OTHER update the telecaller spoke that none of the fields above captured — " +
    "e.g. \"WhatsApp pe brochure bhej diya\", \"Bhai ke saath aayenge\", \"Pehle Noida " +
    "me flat dekha tha\". Empty array if nothing extra. NEVER repeat what a field " +
    "already captured. requirements: fill any the customer stated — bhk (e.g. \"2 BHK\", " +
    "\"plot\"), size (e.g. \"1200 sqft\", \"200 gaj\"), location (area/sector), purpose " +
    "('investment' or 'end_use'), timeline (when they want to buy), loan_needed (true if " +
    "they need finance/loan). Use null for anything not mentioned."
  );
}

// A note where the call simply didn't connect. The transcript is often terse or
// mis-scripted, but the English summary is reliable — so we match on that as a
// safety net to make sure "couldn't reach" ALWAYS becomes a callback.
const UNREACHED_RE =
  /(no answer|not answer|didn.?t answer|not connect|call cut|call not|switch.?ed? off|not pick|didn.?t pick|un(reachable|available)|number not (in service|saved|reachable|valid)|line busy|phone (off|busy|switched|not))/i;

/** Human funnel-stage label for the journey log / summary. */
function stageLabel(s: string): string {
  const m: Record<string, string> = {
    interested: "Interested", site_visit: "Site Visit", negotiation: "Negotiation",
    token_paid: "Token Paid", booked: "Booked / Won", callback: "Callback",
    not_interested: "Not interested", lost: "Lost", dnc: "Do Not Call",
  };
  return m[s] ?? s;
}

/**
 * Fallback temperature inferred from the funnel stage when the model omits it.
 *
 * Reads lead_stages instead of repeating the funnel: hot = a deal in motion or
 * money down, warm = qualified, cold = lost. A call OUTCOME (callback,
 * no_answer) says nothing about how warm the customer is and leaves temperature
 * alone — the stage/action split applied to this heuristic too.
 */
function tempFromDisposition(stages: Map<string, StageRow>, d: string | null): string | null {
  if (!d) return null;
  const row = stages.get(stageOf(d));
  if (!row) return null;
  if (isPipeline(stages, d) || countsAsSale(stages, d)) return "hot";
  if (row.code === "interested") return "warm";
  if (row.outcome === "lost") return "cold";
  return null;
}

/**
 * A lead the automation must not overwrite: money has moved, or the customer
 * has already asked not to be called. Replaces two hand-written lists that
 * disagreed with each other about which stages were protected.
 */
function autoWriteBlocked(stages: Map<string, StageRow>, stage: string | null | undefined): boolean {
  const row = stage ? stages.get(stage) : undefined;
  if (!row) return false;
  return row.counts_as_sale || row.code === "dnc";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!GROQ) return json({ ok: false, error: "GROQ_API_KEY is not configured." }, 500);

  const auth = req.headers.get("Authorization") ?? "";
  const bearer = auth.replace(/^Bearer\s+/i, "").trim();
  const admin = createClient(SUPABASE_URL, SERVICE);

  const { note_id } = await req.json().catch(() => ({}));
  if (!note_id) return json({ ok: false, error: "missing note_id" }, 400);

  // Authorize: service callers skip; users must be able to SELECT the note (RLS).
  if (bearer !== SERVICE) {
    const u = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
    const { data: ud } = await u.auth.getUser();
    if (!ud?.user) return json({ ok: false, error: "Unauthorized" }, 401);
    const { data: visible } = await u.from("lead_voice_notes").select("id").eq("id", note_id).maybeSingle();
    if (!visible) return json({ ok: false, error: "Note not found" }, 404);
  }

  const { data: note } = await admin.from("lead_voice_notes")
    .select("id, contact_id, company_id, actor_id, audio_path, summary, ai_status").eq("id", note_id).maybeSingle();
  if (!note) return json({ ok: false, error: "Note not found" }, 404);
  if (note.ai_status === "ready" && note.summary) {
    return json({ ok: true, summary: note.summary, cached: true });
  }

  await admin.from("lead_voice_notes").update({ ai_status: "processing" }).eq("id", note_id);
  try {
    const { data: blob, error: dlErr } = await admin.storage.from("voice-notes").download(note.audio_path);
    if (dlErr || !blob) throw new Error(`audio download failed: ${dlErr?.message ?? "no data"}`);
    const bytes = new Uint8Array(await blob.arrayBuffer());

    const form = new FormData();
    // turbo: ~4x faster than large-v3, same Hinglish quality for short notes.
    form.append("model", "whisper-large-v3-turbo");
    form.append("file", new Blob([bytes], { type: "audio/mp4" }), "note.m4a");
    // Pin the language to Hindi (stops Whisper rendering Hindi speech in
    // Urdu/Arabic script) and prime it with real-estate vocabulary so project
    // names, budgets and stage words transcribe cleanly.
    form.append("language", "hi");
    form.append(
      "prompt",
      "Real estate telecaller call note in Hindi/Hinglish. Common words: site visit, " +
        "booking, token, plot, BHK, budget, lakh, crore, gaj, loan, EMI, callback, " +
        "interested, not interested, number band, call cut, switch off.",
    );
    const tr = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST", headers: { Authorization: `Bearer ${GROQ}` }, body: form,
    });
    const trj = await tr.json();
    const transcript: string = trj.text ?? "";
    if (!transcript.trim()) throw new Error(`transcription empty: ${JSON.stringify(trj).slice(0, 200)}`);

    // Mistral → Groq → Gemini → Cerebras, several keys each (see chat.ts for why
    // Mistral leads). This is the step that ran out of daily tokens by lunchtime
    // and left every afternoon note reading "AI summary failed".
    // (Transcription above is a separate quota and was never the bottleneck.)
    const { text: raw } = await chatJson(
      systemPrompt(),
      `Voice note transcript:\n\n${transcript.slice(0, 12000)}`,
      { temperature: 0.2 },
    );

    let summary = raw.trim();
    let disposition: string | null = null;
    let svDate: string | null = null, svTime: string | null = null;
    let svCancelled = false, cbRequested = false;
    let cbDate: string | null = null, cbTime: string | null = null;
    let budget: string | null = null, temp: string | null = null;
    let nextStep: string | null = null, phoneInvalid = false;
    let custName: string | null = null, tokenAmount: number | null = null;
    let altPhone: string | null = null, project: string | null = null;
    let connected: boolean | null = null;
    let facts: string[] = [];
    let reqs: Record<string, string> = {};
    try {
      const p = JSON.parse(raw);
      if (typeof p.summary === "string" && p.summary.trim()) summary = p.summary.trim();
      if (typeof p.disposition === "string" && DISPOSITIONS.includes(p.disposition)) disposition = p.disposition;
      if (typeof p.site_visit_date === "string" && DATE_RE.test(p.site_visit_date)) svDate = p.site_visit_date;
      if (typeof p.site_visit_time === "string" && TIME_RE.test(p.site_visit_time)) svTime = p.site_visit_time;
      if (p.site_visit_cancelled === true) svCancelled = true;
      if (typeof p.callback_date === "string" && DATE_RE.test(p.callback_date)) cbDate = p.callback_date;
      if (typeof p.callback_time === "string" && TIME_RE.test(p.callback_time)) cbTime = p.callback_time;
      if (p.callback_requested === true) cbRequested = true;
      if (typeof p.budget === "string" && p.budget.trim()) budget = p.budget.trim().slice(0, 40);
      if (typeof p.temperature === "string" && ["hot", "warm", "cold"].includes(p.temperature)) temp = p.temperature;
      if (typeof p.next_step === "string" && p.next_step.trim()) nextStep = p.next_step.trim().slice(0, 200);
      if (typeof p.customer_name === "string" && p.customer_name.trim().length >= 2) {
        custName = p.customer_name.trim().slice(0, 60);
      }
      if (typeof p.token_amount === "number" && p.token_amount >= 500 && p.token_amount <= 100_000_000) {
        tokenAmount = Math.round(p.token_amount);
      }
      if (typeof p.alt_phone === "string") {
        const digits = p.alt_phone.replace(/\D/g, "");
        if (digits.length >= 10 && digits.length <= 12) altPhone = digits;
      }
      if (typeof p.project === "string" && p.project.trim().length >= 2) {
        project = p.project.trim().slice(0, 60);
      }
      if (typeof p.connected === "boolean") connected = p.connected;
      if (p.phone_invalid === true) phoneInvalid = true;
      if (Array.isArray(p.facts)) {
        facts = p.facts
          .filter((f: unknown): f is string => typeof f === "string" && f.trim().length >= 4)
          .map((f: string) => f.trim().slice(0, 80))
          .slice(0, 3);
      }
      if (p.requirements && typeof p.requirements === "object") {
        const R = p.requirements as Record<string, unknown>;
        for (const k of ["bhk", "size", "location", "purpose", "timeline"]) {
          if (typeof R[k] === "string" && (R[k] as string).trim()) reqs[k] = (R[k] as string).trim().slice(0, 60);
        }
        if (R.loan_needed === true) reqs.loan_needed = "yes";
      }
    } catch { /* keep raw as summary */ }

    // Did the call connect? The model's `connected` flag, backed by the
    // unreached-text safety net. A call that didn't connect (switched off, no
    // answer, busy, cut) is a RETRY — never a wrong number, never "not interested".
    const unreachedText = UNREACHED_RE.test(`${summary} ${transcript}`);
    const notConnected = connected === false || (connected === null && unreachedText);

    // Safety net: if the model gave no stage but the note is clearly a call that
    // didn't connect, treat it as a callback so the lead never stalls in "New".
    if (!disposition && (unreachedText || connected === false)) disposition = "callback";

    // A call that didn't connect can NEVER be not_interested / lost / dnc — those
    // require the customer to have actually spoken. Force it to a retry.
    if (notConnected && ["not_interested", "lost", "dnc"].includes(disposition ?? "")) disposition = "callback";

    // A "switched off / busy / no answer" call is NOT a wrong number. If the
    // model flagged phone_invalid but the call simply didn't connect, drop the
    // invalid flag — it's a retry, not a Do-Not-Call.
    if (phoneInvalid && notConnected) phoneInvalid = false;

    // The canonical stage table, read once. Every lifecycle judgement below
    // comes from it; nothing here decides for itself what a stage means.
    const stages = await loadStages(admin);

    // If the model didn't hand back a temperature, derive one from the stage so
    // the lead's hot/warm/cold badge is always kept accurate from the note.
    if (!temp) temp = tempFromDisposition(stages, disposition);

    // ---------- AUTO-ACTIONS ----------
    const actions: string[] = [];
    const { data: contact } = await admin.from("contacts")
      .select("id, name, phone, alt_phone, company_name, salesperson_id, company_id, status, stage, budget, temperature, extra, notes, site_visit_at, token_amount, attempts")
      .eq("id", note.contact_id).maybeSingle();
    const rep: string | null = contact?.salesperson_id ?? note.actor_id ?? null;
    const who = contact?.name ?? contact?.phone ?? "lead";
    const today = istToday().date;

    async function logAct(type: string, detail: string) {
      await admin.from("lead_activities").insert({
        company_id: note.company_id, contact_id: note.contact_id,
        actor_id: note.actor_id, actor_name: "AI Assistant 🤖", type, detail,
      });
    }
    async function remind(sendAtIso: string, title: string, body: string) {
      if (!rep) return;
      if (new Date(sendAtIso).getTime() <= Date.now()) return; // never schedule the past
      await admin.from("scheduled_notifications").insert({
        company_id: note.company_id, user_id: rep, contact_id: note.contact_id,
        title, body, channel: "followups", send_at: sendAtIso,
      });
    }

    // Spoken command: "number galat hai / band aa raha hai" → retire the lead so
    // nobody wastes another call on it. We use 'dnc' (Do Not Call) because that
    // is the dead state every part of the system already honours consistently —
    // it's terminal on the lead page, an exit chip, out of every pipeline bucket,
    // and protected from the "reassign makes it New again" trigger. A
    // wrong_number marker is kept in extra so it can be reported separately.
    if (contact && phoneInvalid && !autoWriteBlocked(stages, contact.stage)) {
      const prev = (contact.extra && typeof contact.extra === "object" ? contact.extra : {}) as Record<string, unknown>;
      await admin.from("contacts").update({ status: "dnc", extra: { ...prev, wrong_number: true } }).eq("id", contact.id);
      actions.push("Wrong number → Do Not Call");
      await logAct("status", "Wrong / invalid number — moved to Do Not Call (from voice note)");
    }

    // Spoken name → put it on the lead when we only have a number-ish name.
    // Never overwrite a real existing name with a heard one.
    if (contact && custName) {
      const cur = (contact.name ?? "").trim();
      const nameless = !cur || cur.length < 2 || /^[\d+()\s-]+$/.test(cur);
      if (nameless) {
        await admin.from("contacts").update({ name: custName }).eq("id", contact.id);
        actions.push(`Name: ${custName}`);
        await logAct("identity", `Customer name heard: ${custName} (from voice note)`);
      }
    }

    // Second number spoken → fill alt_phone (only when empty, and only if it's
    // genuinely a different number than the lead's main one).
    if (contact && altPhone) {
      const tail = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "").slice(-10);
      const hasAlt = !!(contact.alt_phone && String(contact.alt_phone).trim());
      if (!hasAlt && tail(altPhone) !== tail(contact.phone) && tail(altPhone).length === 10) {
        await admin.from("contacts").update({ alt_phone: altPhone }).eq("id", contact.id);
        actions.push(`Alt number saved`);
        await logAct("identity", `Second number heard: ${altPhone} (from voice note)`);
      }
    }

    // Project named → remember which project this buyer is about (fill-if-empty).
    if (contact && project && !(contact.company_name ?? "").trim()) {
      await admin.from("contacts").update({ company_name: project }).eq("id", contact.id);
      actions.push(`Project: ${project}`);
      await logAct("requirement", `Interested project: ${project} (from voice note)`);
    }

    // Site visit cancelled → clear the planned date so reminders/pipeline don't
    // keep pointing at a visit that isn't happening. The stage then follows the
    // spoken disposition below (usually callback/interested).
    if (contact && svCancelled && !svDate && contact.site_visit_at) {
      await admin.from("contacts").update({ site_visit_at: null, site_visit_project: null }).eq("id", contact.id);
      actions.push("Site visit cancelled");
      await logAct("site_visit", "Site visit cancelled (from voice note)");
    }

    // Site visit agreed → set the stage + date, and arm both reminders.
    //
    // The TIME is only the customer's if the customer gave one. They usually
    // don't — "do din me visit ke liye aayenge", "Sunday visit" — and 11:00 is
    // this function's placeholder so the reminders have a moment to fire
    // against. It is NOT an appointment anybody agreed to. Printing it as one
    // ("Site visit set for 30 Jul, 11:00 AM") turned a customer's rough plan
    // into a booking with a clock time, and the rep who made the note knew
    // perfectly well no time had been fixed.
    //
    // So an unfixed time is now said out loud everywhere the visit is
    // mentioned, and the day-before reminder becomes the job it actually is:
    // ring them and fix the time.
    let visitApplied = false;
    if (contact && !phoneInvalid && svDate && svDate >= today) {
      const visitAt = istIso(svDate, svTime ?? "11:00");
      await admin.from("contacts").update({
        status: "site_visit", site_visit_at: visitAt,
      }).eq("id", contact.id);
      visitApplied = true;
      // prettyIst prints date-only when time is null — never the placeholder.
      const pretty = prettyIst(svDate, svTime);
      const loose = svTime ? "" : " (time not fixed)";
      actions.push(`Site visit planned for ${pretty}${loose}`);
      await logAct("site_visit", `Site visit planned for ${pretty}${loose} (from voice note)`);
      await remind(istIso(addDays(svDate, -1), "10:00"), "🏠 Tomorrow: site visit",
        svTime
          ? `Tomorrow is ${who}'s site visit (${pretty}). Confirm on WhatsApp & prep the documents.`
          : `${who} said they would visit tomorrow (${pretty}) but no time was fixed. Call and fix the time.`);
      await remind(istIso(svDate, "08:30"), "🏠 Today: site visit",
        `Today is ${who}'s site visit (${pretty})${loose}. All the best!`);
      actions.push("Reminders scheduled (day before 10 AM + visit morning)");
    }

    // Token/advance paid → record the money milestone (upgrade-only; a paid
    // token never downgrades a Booked deal).
    if (contact && tokenAmount && contact.status !== "booked") {
      const patch: Record<string, unknown> = { token_amount: tokenAmount, status: "token_paid" };
      if (!contact.token_amount) patch.token_paid_at = new Date().toISOString();
      await admin.from("contacts").update(patch).eq("id", contact.id);
      visitApplied = true; // stage is now settled; don't let disposition move it below
      actions.push(`Token ₹${tokenAmount.toLocaleString("en-IN")} → Token Paid`);
      await logAct("token", `Token ₹${tokenAmount.toLocaleString("en-IN")} received (from voice note)`);
    }

    // Record what the call actually produced.
    //
    // This used to guard against "undoing a win" by refusing to write, because
    // status was carrying BOTH the disposition and the lifecycle position — so
    // a callback recorded on a booked lead erased the booking. It no longer
    // has to: status is the last disposition, contacts.stage is where the deal
    // is, and the monotonic guard in contacts_stage_sync() (migration 0143)
    // refuses to move a stage backwards. Writing "callback" on a won lead now
    // records the callback and leaves the deal won, which is what happened.
    //
    // The lead_activities line is written from the STAGE the lead ends up in,
    // not from the disposition, so the timeline never claims a demotion the
    // database refused.
    if (contact && !phoneInvalid && disposition && !visitApplied && disposition !== contact.status) {
      const { data: after } = await admin.from("contacts")
        .update({ status: disposition }).eq("id", contact.id)
        .select("stage").maybeSingle();
      const landed = after?.stage ?? contact.stage;
      const moved = landed !== contact.stage;
      actions.push(moved
        ? `Stage → ${stages.get(landed)?.label ?? landed}`
        : `Call outcome: ${stageLabel(disposition)}`);
      await logAct("status", moved
        ? `Stage → ${stages.get(landed)?.label ?? landed} (from voice note)`
        : `Call outcome recorded: ${stageLabel(disposition)} — stage stays ${stages.get(landed)?.label ?? landed} (from voice note)`);
    }

    // Call didn't connect → it counts as a NO-CONNECT ATTEMPT. Bump the attempts
    // ladder so the lead shows "🔁 Attempt N". Since 0120 the lead has also
    // already left New for 'no_answer', which puts it in Follow-up's "didn't
    // pick up — try again" section; this just says how many tries it has taken.
    // Capped so it can't run away, and only for a lead still in the calling pile.
    // Only for a lead still in the calling pile: past qualification, or already
    // finished, "attempt 4" is noise.
    if (contact && notConnected && !phoneInvalid &&
        !isPipeline(stages, contact.status) && !autoWriteBlocked(stages, contact.stage)) {
      const nextAttempts = Math.min((contact.attempts ?? 0) + 1, 9);
      await admin.from("contacts").update({ attempts: nextAttempts }).eq("id", contact.id);
      actions.push(`Attempt ${nextAttempts} — didn't connect`);
      await logAct("attempt", `Call didn't connect — attempt ${nextAttempts} (from voice note)`);
    }

    // "Call later" with NO usable day/time (or a past one) → never lose it:
    // default the callback to tomorrow 10:30 IST so a spoken "baad me call
    // karna" always becomes a real follow-up instead of silently vanishing.
    if (cbRequested && !phoneInvalid) {
      const cbOk = cbDate && cbDate >= today &&
        new Date(istIso(cbDate, cbTime ?? "10:00")).getTime() > Date.now();
      if (!cbOk) { cbDate = addDays(today, 1); cbTime = "10:30"; }
    }

    // Lead asked for a callback at a time → follow-up + push at that moment.
    if (contact && cbDate && cbDate >= today && rep) {
      const dueAt = istIso(cbDate, cbTime ?? "10:00");
      if (new Date(dueAt).getTime() > Date.now()) {
        // One lead = one pending follow-up: move the existing one (e.g. the
        // recording-wada's) to the spoken time instead of stacking a second.
        const { data: existingFu } = await admin.from("follow_ups")
          .select("id").eq("contact_id", contact.id).eq("status", "pending")
          .order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (existingFu?.id) {
          await admin.from("follow_ups")
            .update({ due_at: dueAt, note: "AI: voice note se scheduled" })
            .eq("id", existingFu.id);
        } else {
          await admin.from("follow_ups").insert({
            company_id: note.company_id, salesperson_id: rep, contact_id: contact.id,
            phone: contact.phone, name: contact.name, due_at: dueAt,
            note: "AI: voice note se scheduled",
          });
        }
        const pretty = prettyIst(cbDate, cbTime ?? "10:00");
        actions.push(`Callback scheduled for ${pretty}`);
        await logAct("follow_up", `Callback scheduled for ${pretty} (from voice note)`);
        await remind(dueAt, "↻ Callback time", `${who} asked to be called now (${pretty}). Dial from the app.`);
      }
    }

    // Budget / temperature spoken → fill the lead.
    if (contact && (budget || temp)) {
      const patch: Record<string, string> = {};
      if (budget && budget !== contact.budget) patch.budget = budget;
      if (temp && temp !== contact.temperature) patch.temperature = temp;
      if (Object.keys(patch).length) {
        await admin.from("contacts").update(patch).eq("id", contact.id);
        if (patch.budget) { actions.push(`Budget: ${patch.budget}`); await logAct("budget", `Budget: ${patch.budget} (from voice note)`); }
        if (patch.temperature) { actions.push(`Marked ${patch.temperature}`); await logAct("temperature", `Marked ${patch.temperature} (from voice note)`); }
      }
    }

    // Requirements the customer stated → build a lasting profile on the lead
    // (stored in extra.requirements) and surface it in the note.
    let reqLine = "";
    if (contact && Object.keys(reqs).length) {
      const prev = (contact.extra && typeof contact.extra === "object" ? contact.extra : {}) as Record<string, unknown>;
      const merged = { ...(prev.requirements as Record<string, unknown> ?? {}), ...reqs };
      await admin.from("contacts").update({ extra: { ...prev, requirements: merged } }).eq("id", contact.id);
      const parts: string[] = [];
      if (reqs.bhk) parts.push(reqs.bhk);
      if (reqs.size) parts.push(reqs.size);
      if (reqs.location) parts.push(`in ${reqs.location}`);
      if (reqs.purpose) parts.push(reqs.purpose === "investment" ? "investment" : "end-use");
      if (reqs.timeline) parts.push(reqs.timeline);
      if (reqs.loan_needed) parts.push("needs loan");
      reqLine = parts.join(" · ");
      if (reqLine) { actions.push("Requirements captured"); await logAct("requirement", `Needs: ${reqLine} (from voice note)`); }
    }

    // Catch-all: anything ELSE the telecaller said that no structured field
    // captured lands on the lead's notes as "🎙 …" lines — a spoken update must
    // never just disappear. append_contact_note (migration 0078) is atomic and
    // dedup-safe, so this can never race the recording AI's note writes.
    if (contact && facts.length) {
      const curNotes = contact.notes ?? "";
      const fresh = facts.filter((f) => !curNotes.includes(f));
      for (const f of fresh) {
        await admin.rpc("append_contact_note", { p_contact: contact.id, p_line: `🎙 ${f}` });
      }
      if (fresh.length) {
        actions.push(`Noted: ${fresh.join(" · ")}`);
        await logAct("note", `Heard: ${fresh.join(" · ")} (from voice note)`);
      }
    }

    // Coaching: store the "what to say next" tip on the lead so it shows up
    // even in the app the rep already has.
    if (contact && nextStep) {
      await admin.from("contacts").update({ ai_next_action: nextStep }).eq("id", contact.id);
    }

    if (actions.length) summary = `${summary}\n⚡ AI did: ${actions.join(" · ")}`;
    if (reqLine) summary = `${summary}\n📋 Needs: ${reqLine}`;
    if (nextStep) summary = `${summary}\n👉 Next: ${nextStep}`;

    await admin.from("lead_voice_notes")
      .update({ transcript, summary, suggested_disposition: disposition, ai_status: "ready" })
      .eq("id", note_id);
    return json({ ok: true, summary, disposition: disposition ?? undefined, actions, next_step: nextStep ?? undefined });
  } catch (e) {
    // Keep the reason. "failed" on its own sent us hunting for a bug in the
    // audio when the truth was a daily token quota — one line stored here
    // would have said so immediately, and the retry needs it to tell "try
    // again in a minute" apart from "there is no quota until tomorrow".
    await admin.from("lead_voice_notes")
      .update({ ai_status: "failed", ai_error: String(e).slice(0, 500) })
      .eq("id", note_id);
    return json({ ok: false, error: String(e) }, 500);
  }
});
