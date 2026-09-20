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
// Body:
//   { contact_id }                      → a draft (or the call_instead verdict)
//   { draft_id, action:"opened"|"skipped" } → what she did with it
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { groqJson } from "../_shared/groq.ts";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const auth = req.headers.get("Authorization") ?? "";
  const bearer = auth.replace(/^Bearer\s+/i, "").trim();
  const admin = createClient(SUPABASE_URL, SERVICE);
  const body = await req.json().catch(() => ({} as Ctx));

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
  //
  // 'opened' means the WhatsApp chat opened with this text in it. It does NOT
  // mean sent — settle_followups() decides that from the observer, because an
  // app that marks its own homework learns nothing.
  const draftId = String(body?.draft_id ?? "");
  if (draftId) {
    const action = String(body?.action ?? "");
    if (action !== "opened" && action !== "skipped") {
      return json({ ok: false, error: "action must be opened or skipped" }, 400);
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

  const { data: c } = await u.from("contacts")
    .select("id, company_id, salesperson_id, name, phone, stage, status, budget, territory, site_visit_project")
    .eq("id", contactId).maybeSingle();
  if (!c) return json({ ok: false, error: "not your lead" }, 403);

  // ── THE BRAKE, before anything is spent ────────────────────────────────
  const { data: planRows } = await u.rpc("followup_plan", { p_contact: contactId });
  const plan = (Array.isArray(planRows) ? planRows[0] : planRows) as {
    verdict?: string; allowed?: string[]; banned?: string[]; sent_14d?: number; replies_14d?: number;
  } | null;

  if (plan?.verdict === "call_instead") {
    // No model call, no row, no message. This is the honest answer and it is
    // the whole point of the loop: four messages have gone to this person in a
    // fortnight and not one came back. A fifth is not a plan.
    return json({
      ok: true,
      verdict: "call_instead",
      sent_14d: plan.sent_14d ?? 0,
      reason: `${plan.sent_14d ?? 0} messages in two weeks, no reply. Message nahi — call karo.`,
    });
  }

  const allowed = (plan?.allowed ?? []).filter((a) => a in ANGLE_MEANING);
  if (!allowed.length) return json({ ok: false, error: "nothing left to say — call them" }, 200);

  // A live draft she has not dealt with yet. Handing her a second one is how
  // two near-identical messages end up going to the same buyer. A dry run
  // skips this: the whole point of a dry run is to see what the drafter says
  // TODAY, not to be handed yesterday's answer.
  if (!dryRun) {
    const { data: live } = await u.from("followup_drafts")
      .select("id, angle, body, reason, created_at")
      .eq("contact_id", contactId).in("status", ["suggested", "opened"])
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (live && Date.now() - new Date(live.created_at).getTime() < FRESH_HOURS * 3600_000) {
      return json({ ok: true, verdict: "draft", reused: true, draft_id: live.id, angle: live.angle, body: live.body, reason: live.reason });
    }
  }

  // ── the material ───────────────────────────────────────────────────────
  const [{ data: mem }, { data: promises }, { data: thread }, { data: mine }, { data: hints }] =
    await Promise.all([
      u.from("lead_memory")
        .select("where_we_left_it, buyer_wants, objection").eq("contact_id", contactId).maybeSingle(),
      u.from("v_open_promises")
        .select("id, kind, promise, days_open").eq("contact_id", contactId).eq("status", "missed")
        .order("days_open", { ascending: false }).limit(3),
      u.from("wa_observed_messages")
        .select("direction, body, media_kind, sent_at").eq("contact_id", contactId)
        .is("archived_at", null).order("sent_at", { ascending: false }).limit(12),
      // HOW SHE WRITES. Her own real messages, from her other leads too — this
      // is the difference between a draft she sends and a draft she rewrites.
      // 25 characters filters out "ji", "ok" and "👍".
      u.from("wa_observed_messages")
        .select("body").eq("salesperson_id", c.salesperson_id ?? ud?.user?.id ?? "")
        .eq("direction", "out").is("archived_at", null)
        .not("body", "is", null).order("sent_at", { ascending: false }).limit(60),
      u.rpc("followup_angle_hints", { p_company: c.company_id }),
    ]);

  // Company facts, so it can name a real project or price and never invent one.
  let facts: string[] = [];
  try {
    const model = new Supabase.ai.Session("gte-small");
    const embedding = await model.run(
      `${c.site_visit_project ?? ""} project price offer location site visit USP`,
      { mean_pool: true, normalize: true },
    );
    const { data } = await u.rpc("match_knowledge", {
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
  const { data: past } = await u.from("followup_drafts")
    .select("angle, body, sent_at, replied_at").eq("contact_id", contactId).eq("status", "sent")
    .order("sent_at", { ascending: false }).limit(4);
  const alreadySent = (past ?? []).map((p) =>
    `- ${p.angle} on ${String(p.sent_at ?? "").slice(0, 10)}${p.replied_at ? " (they replied)" : " (NO REPLY)"}: ${
      String(p.body ?? "").slice(0, 160)}`).join("\n");

  const evidence = (hints ?? [])
    .filter((h: { reply_rate: number | null }) => h.reply_rate !== null)
    .map((h: { angle: string; sent: number; reply_rate: number }) =>
      `${h.angle}: ${h.reply_rate}% replied (${h.sent} sent)`).join(", ");

  const userMsg = [
    `BUYER: ${c.name ?? "unnamed"}. Stage: ${c.stage}.` +
      (c.budget ? ` Budget on file: ${c.budget}.` : "") +
      (c.site_visit_project ? ` Project: ${c.site_visit_project}.` : "") +
      (c.territory ? ` Area: ${c.territory}.` : ""),
    mem?.where_we_left_it ? `WHERE IT WAS LEFT: ${mem.where_we_left_it}` : "",
    mem?.buyer_wants ? `THEY WANT: ${mem.buyer_wants}` : "",
    mem?.objection ? `WHAT STOPPED THEM (their words): ${mem.objection}` : "",
    (promises ?? []).length
      ? `YOU PROMISED AND HAVE NOT DONE:\n${(promises ?? []).map((p) => `- ${p.promise} (${p.days_open} days ago)`).join("\n")}`
      : "",
    buyerLast ? "THE BUYER WROTE LAST AND IS WAITING FOR AN ANSWER." : "",
    threadText ? `THE THREAD (oldest first):\n${threadText}` : "THE THREAD: nothing on WhatsApp yet.",
    alreadySent ? `RECENT MESSAGES ALREADY SENT BY THIS APP — do not repeat them:\n${alreadySent}` : "",
    style.length ? `WRITING SAMPLES — copy this voice:\n${style.map((s) => `- ${s}`).join("\n")}` : "",
    facts.length ? `COMPANY FACTS (the only numbers you may use):\n${facts.map((f, i) => `${i + 1}. ${f}`).join("\n")}` : "",
    `ALLOWED ANGLES (pick exactly one):\n${allowed.map((a) => `- ${a}: ${ANGLE_MEANING[a]}`).join("\n")}`,
    (plan?.banned ?? []).length
      ? `BANNED for this buyer — already tried twice with no reply: ${(plan!.banned ?? []).join(", ")}`
      : "",
    evidence ? `WHAT GETS REPLIES IN THIS COMPANY: ${evidence}` : "",
  ].filter(Boolean).join("\n\n");

  const out = await groqJson<{ angle?: string; body?: string; reason?: string }>(SYSTEM, userMsg, 0.5);
  if (out.error || !out.data) {
    // Said out loud, not swallowed. A null here used to mean the rep saw
    // "Couldn't draft the message. Please try again." forever while the real
    // answer was that the model had been retired a fortnight earlier.
    return json({ ok: false, error: out.error ?? "no draft" }, 200);
  }

  const text = String(out.data.body ?? "").trim().slice(0, 900);
  if (!text) return json({ ok: false, error: "the model returned an empty message" }, 200);
  let angle = String(out.data.angle ?? "").trim();
  // A model that picks a banned angle does not get to overrule the brake.
  if (!allowed.includes(angle)) angle = allowed[0];

  if (dryRun) {
    return json({
      ok: true, verdict: "draft", dry_run: true, angle, body: text,
      reason: out.data.reason ?? null, model: out.model,
      read: {
        memory: !!mem?.where_we_left_it, promises: (promises ?? []).length,
        thread: ordered.length, style_samples: style.length, facts: facts.length,
        allowed, banned: plan?.banned ?? [],
      },
    });
  }

  const { data: row, error } = await admin.from("followup_drafts").insert({
    company_id: c.company_id,
    contact_id: contactId,
    salesperson_id: c.salesperson_id ?? ud!.user!.id,
    angle,
    body: text,
    reason: String(out.data.reason ?? "").trim().slice(0, 160) || null,
    based_on: {
      used_memory: !!mem?.where_we_left_it,
      promise_ids: (promises ?? []).map((p) => p.id),
      thread_messages: ordered.length,
      style_samples: style.length,
      facts: facts.length,
      banned: plan?.banned ?? [],
      model: out.model,
    },
  }).select("id").single();
  if (error) return json({ ok: false, error: error.message }, 200);

  return json({ ok: true, verdict: "draft", draft_id: row.id, angle, body: text, reason: out.data.reason ?? null });
});
