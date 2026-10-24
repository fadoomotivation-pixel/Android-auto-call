// The follow-up message, written for THIS buyer, in HER words — and the loop
// that finds out whether it worked.
//
// WHAT WAS HERE BEFORE
//
// The lead screen already had a "💬 Message" drafter. The rep picked a purpose
// from a list, and the app pasted it into a hand-written sentence — "a gentle
// follow-up after your last conversation" — and asked the model.
//
// It had never read the recording. It had never read the WhatsApp thread. It
// did not know what the rep had promised this person, what the buyer had
// objected to, how the rep herself writes, what was sent to this number last
// week, or whether a single message it had ever produced got a reply.
//
// So it wrote the same polite nothing to a man waiting for a floor plan and to
// a woman who had said the rate was too high. And on day four it wrote it
// again. This replaces the brain behind that button; the button stays where it
// is, because a second place to write a message is a second place to forget.
//
// THE FOUR THINGS IT NOW READS
//
//   lead_memory      where the conversation was left, what they want, what
//                    stopped them — distilled from calls AND WhatsApp (0209)
//   lead_promises    what she told them she would do and has not (0211)
//   the thread       the last dozen messages, both directions
//   her own writing  her real recent messages, so the draft sounds like her
//                    and not like a brochure
//
// THE LOOP
//
// Every draft is logged. The app cannot mark one "sent" — the Baileys observer
// watching her own number does that, by seeing a real outbound message go
// afterwards. A reply within seven days is the only success this is allowed to
// claim. Reply rate per angle then steers the next draft (0214).
//
// THE BRAKE — the founder's words: "4 din ek jaisa message gya to brain apne
// aap update ho". followup_plan() removes an angle already tried twice on this
// lead with no reply, BEFORE the model is asked, and after four unanswered
// messages in a fortnight it refuses to draft anything and says to ring them
// instead. Every messaging tool ever built answers silence with another
// message. A good telecaller picks up the phone.
//
// AFTER THE CALL — the founder's words: "call katne k baad recording ka
// analysis ho ... uske no se jo whatsapp jana chahiye vo bhej do. Approve krne
// ka button app pr aa jae".
//
// followup_drafts held ONE row in its life, because the brain waited for a rep
// to open a lead and press a button. Now the end of a real call asks for the
// message itself: when the call's summary lands, a trigger (0235) posts
// mode:"after_call" here. The draft is written from the call she just had, in
// her voice (rep_personas + her own messages), and her phone gets a push. She
// opens the lead, edits it if she wants, taps Approve — and it goes from HER
// WhatsApp, through her linked session. No WhatsApp app, no copy-paste.
//
// Sent from her number means sent BY her: only the rep the draft was written
// for can approve it, only to her own lead, only the words she approved. When
// her WhatsApp is not linked the app falls back to opening WhatsApp with the
// text, as before.
//
// Body:
//   { contact_id }                               → a draft (or the call_instead verdict)
//   { draft_id, action:"opened"|"skipped" }      → what she did with it
//   { draft_id, action:"send", body }            → send it from her own WhatsApp
//   { mode:"after_call", call_id }  service key  → the draft the end of a call writes
//   { mode:"dry_run", contact_id }  service key  → see a draft, write nothing
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { askJson } from "../_shared/chat.ts";
import { BaileysProvider } from "../_shared/wa-provider.ts";

declare const Supabase: {
  ai: { Session: new (m: string) => { run(input: string, opts: { mean_pool: boolean; normalize: boolean }): Promise<number[]> } };
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

/** A draft older than this is about a conversation that has moved on. */
const FRESH_HOURS = 12;

const ANGLE_MEANING: Record<string, string> = {
  // "and say so plainly" was not enough. The first real dry run produced
  // "maine project details aapko bhej diya hai" — I have already sent you the
  // details — to a man who had been waiting fifteen days for exactly that.
  // The angle exists BECAUSE it was never sent; a message that opens by
  // claiming otherwise is a lie told to a customer in the rep's name.
  deliver_promise: "you promised this and have NOT done it yet. Send it NOW, with this message. "
    + "Write it as something happening now or in the next minute — never as something already done",
  answer_objection: "answer the exact thing that stopped them, in their words, with a real fact",
  visit_invite: "get a site visit into the diary — propose a specific day, not 'kabhi aa jaiye'",
  new_information: "tell them something they do not know yet: a new unit, a price, a live offer",
  reply_to_them: "they wrote last and are waiting — answer their actual question first",
  re_engage: "it has gone quiet; give them one genuine reason to reply",
  soft_check_in: "a plain nudge with nothing new to say — the weakest one, use it last",
};

const SYSTEM =
  "You write WhatsApp messages for an Indian real-estate telecaller to send to ONE buyer. You are given what " +
  "was actually said on the phone and on WhatsApp, what she promised, and examples of how SHE writes.\n" +
  'Reply ONLY as JSON: {"angle": string, "body": string, "reason": string}\n' +
  "angle: exactly one of the ALLOWED ANGLES given. Pick the one with a real reason behind it in the material; " +
  "prefer whichever the company evidence shows gets replies, but never pick an angle the material does not " +
  "support just because it scores well.\n" +
  "body: the message itself, ready to send. 2-4 short lines. Simple everyday language, the way SHE writes — " +
  "copy her register and her mix of Hindi and English from the WRITING SAMPLES, not a brochure's. Always " +
  "respectful 'aap', never tu/tum. Use their NAME. At most one emoji. End with ONE clear, easy next step — a " +
  "question they can answer with one word or a day they can say yes to.\n" +
  "reason: max ~12 words telling the REP why this message and not a generic one, e.g. 'Floor plan you promised " +
  "on Tuesday is still not sent'. She must be able to disagree with you, so say what you based it on.\n" +
  "HARD RULES:\n" +
  "- NEVER invent a price, a size, a date, an offer or a project name. Use only what is in the material or the " +
  "COMPANY FACTS. If you have no real fact, write a message that needs none.\n" +
  "- NEVER CLAIM SOMETHING WAS ALREADY DONE. Not 'maine bhej diya hai', not 'as discussed yesterday', not " +
  "'aapki booking ho gayi hai'. If it had been done this message would not exist, and the customer knows it " +
  "was not. Offering or doing it now is fine: 'abhi bhej rahi hoon', 'aaj sham tak bhej deti hoon'.\n" +
  "- PROPOSING a day or a time is allowed and good ('Tuesday 2 baje ya Wednesday 4 baje — kaun sa theek hai?'). " +
  "Stating one as already fixed is not.\n" +
  "- Write 'site visit'. The call transcriber mishears it as 'side visit' and it may appear that way in the " +
  "material; never copy that into a message a customer will read.\n" +
  "- NEVER repeat the opening words or the shape of the RECENT MESSAGES ALREADY SENT. If she has already asked " +
  "'koi update sir?' twice, asking it a third time is the failure this whole feature exists to prevent.\n" +
  "- Do not apologise twice, do not grovel, and do not write a paragraph. She is a professional, not a beggar.\n" +
  "- No preamble, no sign-off block, no 'Dear Sir'. Just the message.";

type Ctx = Record<string, unknown>;

const CONTACT_COLS = "id, company_id, salesperson_id, name, phone, stage, status, budget, territory, site_visit_project";
type Lead = {
  id: string; company_id: string; salesperson_id: string | null; name: string | null; phone: string | null;
  stage: string | null; status: string | null; budget: string | null; territory: string | null;
  site_visit_project: string | null;
};
type CallRow = {
  id: string; company_id: string; salesperson_id: string | null; contact_id: string | null;
  started_at: string | null; duration_seconds: number | null; summary: string | null;
  ai_actions: Record<string, unknown> | null; suggested_disposition: string | null;
};

type Composed =
  | { kind: "call_instead"; sent14d: number; reason: string }
  | { kind: "nothing"; error: string }
  | { kind: "error"; error: string }
  | {
    kind: "draft"; angle: string; body: string; reason: string | null; model: string | null;
    based_on: Record<string, unknown>; read: Record<string, unknown>;
  };

const istTime = (iso: string) => new Date(iso).toLocaleString("en-IN", {
  timeZone: "Asia/Kolkata", weekday: "short", hour: "numeric", minute: "2-digit", hour12: true,
});

/** A number WhatsApp can address: digits, with India's code on a bare ten. */
function waNumber(raw: string | null): string {
  const d = String(raw ?? "").replace(/\D/g, "");
  return d.length === 10 ? `91${d}` : d;
}

/**
 * The brain: read everything known about this buyer and this rep, ask once,
 * return the message. `db` is the rep's own client when she asked (so RLS
 * decides what it may read) and the service client after a call or in a dry
 * run. `call` is the conversation that just ended, when there is one.
 */
async function compose(db: SupabaseClient, c: Lead, repId: string, call: CallRow | null): Promise<Composed> {
  // ── THE BRAKE, before anything is spent ────────────────────────────────
  const { data: planRows } = await db.rpc("followup_plan", { p_contact: c.id });
  const plan = (Array.isArray(planRows) ? planRows[0] : planRows) as {
    verdict?: string; allowed?: string[]; banned?: string[]; sent_14d?: number; replies_14d?: number;
  } | null;

  if (plan?.verdict === "call_instead") {
    // No model call, no row, no message. This is the honest answer and it is
    // the whole point of the loop: four messages have gone to this person in a
    // fortnight and not one came back. A fifth is not a plan.
    return {
      kind: "call_instead",
      sent14d: plan.sent_14d ?? 0,
      reason: `${plan.sent_14d ?? 0} messages in two weeks, no reply. Don't message. Call.`,
    };
  }

  const allowed = (plan?.allowed ?? []).filter((a) => a in ANGLE_MEANING);
  if (!allowed.length) return { kind: "nothing", error: "nothing left to say — call them" };

  // ── the material ───────────────────────────────────────────────────────
  const [{ data: mem }, { data: promises }, { data: thread }, { data: mine }, { data: hints }, { data: persona }] =
    await Promise.all([
      db.from("lead_memory")
        .select("where_we_left_it, buyer_wants, objection").eq("contact_id", c.id).maybeSingle(),
      db.from("v_open_promises")
        .select("id, kind, promise, days_open").eq("contact_id", c.id).eq("status", "missed")
        .order("days_open", { ascending: false }).limit(3),
      db.from("wa_observed_messages")
        .select("direction, body, media_kind, sent_at").eq("contact_id", c.id)
        .is("archived_at", null).order("sent_at", { ascending: false }).limit(12),
      // HOW SHE WRITES. Her own real messages, from her other leads too — this
      // is the difference between a draft she sends and a draft she rewrites.
      // 25 characters filters out "ji", "ok" and "👍".
      db.from("wa_observed_messages")
        .select("body").eq("salesperson_id", repId)
        .eq("direction", "out").is("archived_at", null)
        .not("body", "is", null).order("sent_at", { ascending: false }).limit(60),
      db.rpc("followup_angle_hints", { p_company: c.company_id }),
      // WHO SHE IS — built nightly from her recorded calls and her own chats.
      db.from("rep_personas").select("persona").eq("salesperson_id", repId).maybeSingle(),
    ]);

  // Company facts, so it can name a real project or price and never invent one.
  let facts: string[] = [];
  try {
    const model = new Supabase.ai.Session("gte-small");
    const embedding = await model.run(
      `${c.site_visit_project ?? ""} ${call?.summary ?? ""} project price offer location site visit USP`.slice(0, 1200),
      { mean_pool: true, normalize: true },
    );
    const { data } = await db.rpc("match_knowledge", {
      p_company: c.company_id, p_embedding: embedding, p_match_count: 4, p_min_similarity: 0.25,
    });
    if (Array.isArray(data)) {
      facts = data.map((d: { title?: string; content: string }) => (d.title ? `[${d.title}] ` : "") + d.content);
    }
  } catch (_e) { /* the draft just stays free of specifics */ }

  const ordered = [...(thread ?? [])].reverse();
  const buyerLast = ordered.length > 0 && ordered[ordered.length - 1].direction === "in";
  const style = (mine ?? [])
    .map((m) => String(m.body ?? "").trim())
    .filter((t) => t.length >= 25 && t.length <= 400)
    .slice(0, 8);

  const threadText = ordered.map((m) => {
    const who = m.direction === "in" ? "BUYER" : "REP";
    const when = String(m.sent_at ?? "").slice(0, 10);
    const what = m.media_kind && !String(m.body ?? "").trim()
      ? `(sent a ${m.media_kind})`
      : String(m.body ?? "").slice(0, 240);
    return `[${who} ${when}] ${what}`;
  }).join("\n");

  // What the app has already said to this person, so it cannot say it again.
  const { data: past } = await db.from("followup_drafts")
    .select("angle, body, sent_at, replied_at").eq("contact_id", c.id).eq("status", "sent")
    .order("sent_at", { ascending: false }).limit(4);
  const alreadySent = (past ?? []).map((p) =>
    `- ${p.angle} on ${String(p.sent_at ?? "").slice(0, 10)}${p.replied_at ? " (they replied)" : " (NO REPLY)"}: ${
      String(p.body ?? "").slice(0, 160)}`).join("\n");

  const evidence = (hints ?? [])
    .filter((h: { reply_rate: number | null }) => h.reply_rate !== null)
    .map((h: { angle: string; sent: number; reply_rate: number }) =>
      `${h.angle}: ${h.reply_rate}% replied (${h.sent} sent)`).join(", ");

  const p = (persona?.persona ?? null) as Record<string, unknown> | null;
  const personaText = p
    ? [
      p.summary ? `${p.summary}` : "",
      p.how_she_sounds ? `How she sounds: ${p.how_she_sounds}` : "",
      Array.isArray(p.her_phrases) && p.her_phrases.length ? `Words she uses: ${(p.her_phrases as string[]).slice(0, 6).join(" | ")}` : "",
    ].filter(Boolean).join("\n").slice(0, 700)
    : "";

  // THE CALL THAT JUST ENDED. It really happened minutes ago, so unlike the
  // rest of the material she may refer to it ("abhi baat hui").
  const a = (call?.ai_actions ?? {}) as Record<string, unknown>;
  const callText = call?.summary
    ? [
      `THE CALL THAT JUST ENDED (${Math.max(1, Math.round((call.duration_seconds ?? 0) / 60))} min, ${
        call.started_at ? istTime(call.started_at) : "just now"}): ${String(call.summary).slice(0, 900)}`,
      a.promise_note ? `Agreed on that call: ${a.promise_note}${a.promise_at ? ` (${istTime(String(a.promise_at))})` : ""}` : "",
      Array.isArray(a.objections) && a.objections.length ? `They said: ${(a.objections as string[]).join(", ")}` : "",
      a.preferences ? `They want: ${a.preferences}` : "",
      "Write the message she sends RIGHT AFTER this call: their name, the one thing agreed or still open, and " +
        "the next step. The call is real and just happened, so you MAY say you just spoke.",
    ].filter(Boolean).join("\n")
    : "";

  const userMsg = [
    `BUYER: ${c.name ?? "unnamed"}. Stage: ${c.stage}.` +
      (c.budget ? ` Budget on file: ${c.budget}.` : "") +
      (c.site_visit_project ? ` Project: ${c.site_visit_project}.` : "") +
      (c.territory ? ` Area: ${c.territory}.` : ""),
    callText,
    mem?.where_we_left_it ? `WHERE IT WAS LEFT: ${mem.where_we_left_it}` : "",
    mem?.buyer_wants ? `THEY WANT: ${mem.buyer_wants}` : "",
    mem?.objection ? `WHAT STOPPED THEM (their words): ${mem.objection}` : "",
    (promises ?? []).length
      ? `YOU PROMISED AND HAVE NOT DONE:\n${(promises ?? []).map((p) => `- ${p.promise} (${p.days_open} days ago)`).join("\n")}`
      : "",
    buyerLast ? "THE BUYER WROTE LAST AND IS WAITING FOR AN ANSWER." : "",
    threadText ? `THE THREAD (oldest first):\n${threadText}` : "THE THREAD: nothing on WhatsApp yet.",
    alreadySent ? `RECENT MESSAGES ALREADY SENT BY THIS APP — do not repeat them:\n${alreadySent}` : "",
    personaText ? `WHO SHE IS (from her own calls and chats) — write as this person:\n${personaText}` : "",
    style.length ? `WRITING SAMPLES — copy this voice:\n${style.map((s) => `- ${s}`).join("\n")}` : "",
    facts.length ? `COMPANY FACTS (the only numbers you may use):\n${facts.map((f, i) => `${i + 1}. ${f}`).join("\n")}` : "",
    `ALLOWED ANGLES (pick exactly one):\n${allowed.map((a) => `- ${a}: ${ANGLE_MEANING[a]}`).join("\n")}`,
    (plan?.banned ?? []).length
      ? `BANNED for this buyer — already tried twice with no reply: ${(plan!.banned ?? []).join(", ")}`
      : "",
    evidence ? `WHAT GETS REPLIES IN THIS COMPANY: ${evidence}` : "",
  ].filter(Boolean).join("\n\n");

  const out = await askJson<{ angle?: string; body?: string; reason?: string }>(SYSTEM, userMsg, 0.5);
  if (out.error || !out.data) {
    // Said out loud, not swallowed. A null here used to mean the rep saw
    // "Couldn't draft the message. Please try again." forever while the real
    // answer was that the model had been retired a fortnight earlier.
    return { kind: "error", error: out.error ?? "no draft" };
  }

  const text = String(out.data.body ?? "").trim().slice(0, 900);
  if (!text) return { kind: "error", error: "the model returned an empty message" };
  let angle = String(out.data.angle ?? "").trim();
  // A model that picks a banned angle does not get to overrule the brake.
  if (!allowed.includes(angle)) angle = allowed[0];

  return {
    kind: "draft", angle, body: text,
    reason: String(out.data.reason ?? "").trim().slice(0, 160) || null,
    model: out.model,
    based_on: {
      used_memory: !!mem?.where_we_left_it,
      promise_ids: (promises ?? []).map((p) => p.id),
      thread_messages: ordered.length,
      style_samples: style.length,
      persona: !!personaText,
      after_call: !!callText,
      facts: facts.length,
      banned: plan?.banned ?? [],
      model: out.model,
    },
    read: {
      memory: !!mem?.where_we_left_it, promises: (promises ?? []).length,
      thread: ordered.length, style_samples: style.length, persona: !!personaText,
      call: !!callText, facts: facts.length, allowed, banned: plan?.banned ?? [],
    },
  };
}

/** The worker a company's WhatsApp sessions live on. The secret never leaves the server. */
async function workerFor(admin: SupabaseClient, companyId: string): Promise<BaileysProvider | null> {
  const { data: b } = await admin.from("whatsapp_baileys").select("base_url").eq("company_id", companyId).maybeSingle();
  if (!b?.base_url) return null;
  const { data: secret } = await admin.rpc("get_baileys_secret", { p_company: companyId });
  if (!secret) return null;
  return new BaileysProvider(String(b.base_url), String(secret));
}

/**
 * The end of a real call writes the message. Called by the 0235 trigger when a
 * call's summary lands; never by a person.
 */
async function afterCall(admin: SupabaseClient, callId: string): Promise<Record<string, unknown>> {
  if (!callId) return { ok: false, error: "call_id required" };
  const { data: call } = await admin.from("call_logs")
    .select("id, company_id, salesperson_id, contact_id, started_at, duration_seconds, summary, ai_actions, suggested_disposition")
    .eq("id", callId).maybeSingle();
  const cr = call as CallRow | null;
  if (!cr?.contact_id || !cr.salesperson_id) return { ok: true, skipped: "not a call with a lead" };

  // One message per call. The trigger can fire twice; the buyer must not get two.
  const { data: had } = await admin.from("followup_drafts").select("id").eq("call_id", callId).maybeSingle();
  if (had) return { ok: true, skipped: "already written", draft_id: had.id };

  const { data: lead } = await admin.from("contacts").select(CONTACT_COLS).eq("id", cr.contact_id).maybeSingle();
  const c = lead as Lead | null;
  if (!c) return { ok: true, skipped: "lead gone" };
  // The lead moved to someone else since the call. Her number must not write
  // to a buyer who is now another rep's conversation.
  if (c.salesperson_id && c.salesperson_id !== cr.salesperson_id) return { ok: true, skipped: "lead is now someone else's" };

  // A message written after a LATER conversation is the one that matters; an
  // older one still waiting is about a conversation that has moved on.
  const { data: live } = await admin.from("followup_drafts")
    .select("id, created_at").eq("contact_id", c.id).in("status", ["suggested", "opened"])
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (live && cr.started_at && new Date(live.created_at) > new Date(cr.started_at)) {
    return { ok: true, skipped: "a newer message is already waiting", draft_id: live.id };
  }

  const r = await compose(admin, c, cr.salesperson_id, cr);
  if (r.kind !== "draft") return { ok: true, skipped: r.kind, reason: "error" in r ? r.error : r.reason };

  if (live) {
    await admin.from("followup_drafts").update({ status: "stale", settled_at: new Date().toISOString() }).eq("id", live.id);
  }
  const { data: row, error } = await admin.from("followup_drafts").insert({
    company_id: c.company_id,
    contact_id: c.id,
    salesperson_id: cr.salesperson_id,
    angle: r.angle,
    body: r.body,
    reason: r.reason,
    based_on: r.based_on,
    source: "after_call",
    call_id: cr.id,
  }).select("id").single();
  // The unique index on call_id: a second trigger lost the race. Not an error.
  if (error) return { ok: true, skipped: error.code === "23505" ? "already written" : error.message };

  // Her phone buzzes. Tapping it opens this lead with the message on screen.
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/notify-rep`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        user_ids: [cr.salesperson_id],
        contact_id: c.id,
        channel: "followups",
        title: `WhatsApp for ${c.name ?? "your lead"} is ready`,
        body: `${r.body.replace(/\s+/g, " ").slice(0, 90)}… Tap to check and send.`,
      }),
    });
  } catch (_e) { /* the draft is on the lead either way */ }

  return { ok: true, draft_id: row.id };
}

/**
 * She approved it — send it from her own WhatsApp.
 *
 * Every check here is about one thing: a message from her number is a message
 * FROM HER. Her draft, her lead, the words she approved, her linked session.
 * When the session cannot send, the app is told to open WhatsApp instead
 * (fallback: true) — the message never just disappears.
 */
async function sendApproved(
  admin: SupabaseClient, u: SupabaseClient, uid: string, draftId: string, edited: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const { data: d } = await u.from("followup_drafts")
    .select("id, company_id, contact_id, salesperson_id, body, status").eq("id", draftId).maybeSingle();
  if (!d) return { status: 404, body: { ok: false, error: "That message is not yours." } };
  if (d.salesperson_id !== uid) {
    return { status: 403, body: { ok: false, error: "Only the telecaller it was written for can send it from her number." } };
  }
  if (!["suggested", "opened"].includes(String(d.status))) {
    return { status: 409, body: { ok: false, error: "This message was already sent or dismissed." } };
  }
  const text = String(typeof edited === "string" && edited.trim() ? edited : d.body ?? "").trim();
  if (!text) return { status: 400, body: { ok: false, error: "The message is empty." } };
  if (text.length > 1500) return { status: 400, body: { ok: false, error: "That is too long for one WhatsApp message." } };

  const { data: c } = await admin.from("contacts").select("phone, salesperson_id, name").eq("id", d.contact_id).maybeSingle();
  if (!c?.phone) return { status: 400, body: { ok: false, error: "This lead has no phone number." } };
  if (c.salesperson_id !== uid) return { status: 403, body: { ok: false, error: "This lead is no longer yours." } };

  const { data: sess } = await admin.from("wa_rep_sessions").select("status").eq("salesperson_id", uid).maybeSingle();
  if (sess?.status !== "connected") {
    return {
      status: 200,
      body: { ok: false, fallback: true, error: "Your WhatsApp is not linked to Call Pro AI, so it opens WhatsApp instead." },
    };
  }
  const w = await workerFor(admin, d.company_id);
  if (!w) return { status: 200, body: { ok: false, fallback: true, error: "WhatsApp sending is not set up for this company." } };

  const res = await w.repSend(uid, waNumber(c.phone), text);
  if (!res.ok) return { status: 200, body: { ok: false, fallback: true, error: res.error } };

  const now = new Date().toISOString();
  const { error: upErr } = await admin.from("followup_drafts").update({
    status: "sent", sent_at: now, settled_at: now, sent_body: text, sent_via: "linked_whatsapp",
    wa_message_id: res.id, edited: text !== String(d.body ?? "").trim(),
  }).eq("id", d.id);
  // It HAS gone. Whatever else fails, the row must say sent, or the card stays
  // up and the buyer gets it twice.
  if (upErr) {
    await admin.from("followup_drafts").update({ status: "sent", sent_at: now, settled_at: now, sent_body: text }).eq("id", d.id);
  }
  await admin.from("lead_activities").insert({
    company_id: d.company_id, contact_id: d.contact_id, actor_id: uid, actor_name: "WhatsApp",
    type: "whatsapp", detail: `Sent from your WhatsApp: ${text.slice(0, 160)}`,
  });
  return { status: 200, body: { ok: true, sent: true, via: "linked_whatsapp" } };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const auth = req.headers.get("Authorization") ?? "";
  const bearer = auth.replace(/^Bearer\s+/i, "").trim();
  const admin = createClient(SUPABASE_URL, SERVICE);
  const body = await req.json().catch(() => ({} as Ctx));

  // ── after a call — service key only ─────────────────────────────────────
  if (body?.mode === "after_call") {
    if (bearer !== SERVICE) return json({ ok: false, error: "service key required" }, 401);
    return json(await afterCall(admin, String(body.call_id ?? "")));
  }

  // DRY RUN — service key only, writes nothing.
  //
  // There is no way to read a draft's quality from a schema. This lets a human
  // point the drafter at any lead and see exactly what it would say, without
  // creating a row, without touching the learning data and without a message
  // going anywhere near a customer. It is the same reason promise-watch has
  // mode:"models": a brain you cannot inspect is a brain you cannot trust.
  const dryRun = body?.mode === "dry_run";
  if (dryRun && bearer !== SERVICE) return json({ ok: false, error: "service key required" }, 401);

  // The rep's own client. In a dry run there is no rep, so the service client
  // stands in for reads only — nothing is written either way.
  const u = dryRun
    ? admin
    : createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
  const ud = dryRun ? { user: null } : (await u.auth.getUser()).data;
  if (!dryRun && !ud?.user) return json({ ok: false, error: "Sign in first" }, 401);

  // ── what she did with a draft ──────────────────────────────────────────
  const draftId = String(body?.draft_id ?? "");
  if (draftId) {
    const action = String(body?.action ?? "");
    if (action === "send" && !dryRun) {
      const r = await sendApproved(admin, u, ud!.user!.id, draftId, body?.body);
      // Always 200 with ok:false and the reason: the app shows the reason, and
      // a non-2xx reaches it as an exception with the words stripped off.
      return json({ ...r.body, status: r.status });
    }
    // 'opened' means the WhatsApp chat opened with this text in it. It does
    // NOT mean sent — settle_followups() decides that from the observer,
    // because an app that marks its own homework learns nothing.
    if (action !== "opened" && action !== "skipped") {
      return json({ ok: false, error: "action must be opened, skipped or send" }, 400);
    }
    const patch = action === "opened"
      ? { status: "opened", opened_at: new Date().toISOString() }
      : { status: "skipped", settled_at: new Date().toISOString() };
    // Through the USER's client on purpose: the RLS policy is what stops one
    // rep closing another rep's draft, and it also refuses to let anyone write
    // 'sent' by hand.
    const { error } = await u.from("followup_drafts").update(patch).eq("id", draftId);
    if (error) return json({ ok: false, error: error.message }, 400);
    return json({ ok: true });
  }

  // ── a draft for one lead ───────────────────────────────────────────────
  const contactId = String(body?.contact_id ?? "");
  if (!contactId) return json({ ok: false, error: "contact_id required" }, 400);

  const { data: lead } = await u.from("contacts").select(CONTACT_COLS).eq("id", contactId).maybeSingle();
  const c = lead as Lead | null;
  if (!c) return json({ ok: false, error: "not your lead" }, 403);

  // A live draft she has not dealt with yet — including the one the end of
  // her last call wrote. Handing her a second one is how two near-identical
  // messages end up going to the same buyer. A dry run skips this: the whole
  // point of a dry run is to see what the drafter says TODAY.
  if (!dryRun) {
    const { data: live } = await u.from("followup_drafts")
      .select("id, angle, body, reason, created_at, source")
      .eq("contact_id", contactId).in("status", ["suggested", "opened"])
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (live && Date.now() - new Date(live.created_at).getTime() < FRESH_HOURS * 3600_000) {
      return json({
        ok: true, verdict: "draft", reused: true, draft_id: live.id, angle: live.angle, body: live.body,
        reason: live.reason, source: live.source,
      });
    }
  }

  const repId = c.salesperson_id ?? ud?.user?.id ?? "";
  const r = await compose(u, c, repId, null);
  if (r.kind === "call_instead") {
    return json({ ok: true, verdict: "call_instead", sent_14d: r.sent14d, reason: r.reason });
  }
  if (r.kind !== "draft") return json({ ok: false, error: r.error }, 200);

  if (dryRun) {
    return json({
      ok: true, verdict: "draft", dry_run: true, angle: r.angle, body: r.body,
      reason: r.reason, model: r.model, read: r.read,
    });
  }

  const { data: row, error } = await admin.from("followup_drafts").insert({
    company_id: c.company_id,
    contact_id: contactId,
    salesperson_id: c.salesperson_id ?? ud!.user!.id,
    angle: r.angle,
    body: r.body,
    reason: r.reason,
    based_on: r.based_on,
  }).select("id").single();
  if (error) return json({ ok: false, error: error.message }, 200);

  return json({ ok: true, verdict: "draft", draft_id: row.id, angle: r.angle, body: r.body, reason: r.reason, source: "button" });
});
