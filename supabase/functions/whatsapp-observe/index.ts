// The rep's WhatsApp, written down — nothing sent, ever.
//
// The Baileys worker watches a telecaller's own WhatsApp as a linked device and
// posts what it saw here in small batches. This endpoint is the privacy gate and
// the only writer of wa_observed_messages.
//
//   POST /functions/v1/whatsapp-observe
//   Authorization: Bearer <BAILEYS_INGEST_SECRET>
//   { "salesperson_id": "...", "wa_number": "9198...", "messages": [
//       { "id": "3EB0...", "peer": "919876543210", "direction": "out",
//         "text": "...", "media_kind": "document",
//         "sent_at": "2026-08-20T09:12:00Z" } ] }
//
// THREE RULES, ENFORCED HERE RATHER THAN TRUSTED TO THE CALLER
//
// 1. A message is stored ONLY if the other party is a lead in this rep's own
//    company. match_wa_contact returns null for anyone else and the message is
//    dropped unread — never logged, never counted, never persisted. A rep's
//    family, friends and salary conversations do not enter this database. This
//    is the rule that makes observing a rep's personal number acceptable at all.
//
// 2. The message is kept IN FULL — but only ever for a conversation with a
//    lead, because rule 1 runs first. This was a 300-character preview until
//    the founder decided the CRM should hold the whole thread: these are the
//    company's own leads discussing the company's own property, and every CRM
//    shows the thread with a customer. Rule 1 is what makes that acceptable,
//    and rule 1 is untouched. The rep is told before they scan.
//
// 3. Nothing here can send. There is no outbound path in this function, and the
//    schema has no queue for one. The worker's send route stays reserved for
//    the founder's own notification number.
//
// verify_jwt must be OFF: the caller is a Node worker on a VPS with a shared
// bearer, not a signed-in user. The bearer is the only thing standing between
// this and a public "write into any company's CRM" endpoint, so it is compared
// in constant time and the function refuses to start without it.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INGEST_SECRET = Deno.env.get("BAILEYS_INGEST_SECRET") ?? "";

function json(o: unknown, status = 200) {
  return new Response(JSON.stringify(o), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Length-safe compare, so a wrong bearer cannot be found one byte at a time. */
function secretMatches(given: string): boolean {
  if (!INGEST_SECRET || given.length !== INGEST_SECRET.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ INGEST_SECRET.charCodeAt(i);
  return diff === 0;
}

/** What WhatsApp attached, as the schema's check constraint spells it. */
const MEDIA_KINDS = ["document", "image", "video", "audio", "sticker", "other"] as const;
type MediaKind = (typeof MEDIA_KINDS)[number];

function normaliseKind(raw: unknown): MediaKind | null {
  const k = typeof raw === "string" ? raw : "";
  return (MEDIA_KINDS as readonly string[]).includes(k) ? (k as MediaKind) : null;
}

/**
 * Did this message carry the project details a buyer asked for?
 *
 * The founder's rule: a PDF, an image or a video is details.
 *
 * A VOICE NOTE IS NOT, and that exclusion is the point. Indian real estate runs
 * on voice notes; counting them would mean a rep who sends forty in a morning
 * outscores one who actually sent the plot layout, and the single number an
 * admin judges a telecaller by would reward the easiest thing they can do.
 * Recorded, shown on the lead, not counted here.
 *
 * A link still counts — that is how a tracked brochure from content_shares
 * goes out, and a tracked link additionally proves the buyer opened it.
 *
 * Evidence only, never the wording: "bhai plot ki details bhej raha hu" with
 * nothing attached is not details.
 */
function isDetails(text: string, kind: MediaKind | null): boolean {
  if (kind === "document" || kind === "image" || kind === "video") return true;
  return /https?:\/\/\S+/i.test(text ?? "");
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!INGEST_SECRET) return json({ error: "ingest secret not configured" }, 503);

  const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!secretMatches(bearer)) return json({ error: "unauthorized" }, 401);

  const body = await req.json().catch(() => null);
  const salespersonId: string | undefined = body?.salesperson_id;
  const messages: unknown[] = Array.isArray(body?.messages) ? body.messages : [];
  if (!salespersonId) return json({ error: "salesperson_id required" }, 400);
  // A batch is a batch. An unbounded one is a memory bug waiting for a rep who
  // reconnects after a week offline.
  if (messages.length > 200) return json({ error: "batch too large (max 200)" }, 413);
  // A BATCH IS NOT ONLY MESSAGES ANY MORE.
  //
  // This used to return early on an empty messages array — which would have
  // silently thrown away every WhatsApp call, because a rep who rang a buyer
  // and did not type anything sends exactly that: no messages, one call. The
  // one telecaller behaviour this was built to capture would have been the one
  // it dropped.
  const callsIn = Array.isArray(body?.calls) ? body.calls.length : 0;
  const receiptsIn = Array.isArray(body?.receipts) ? body.receipts.length : 0;
  if (messages.length === 0 && callsIn === 0 && receiptsIn === 0) {
    return json({ ok: true, stored: 0, skipped: 0, calls: 0, receipts: 0 });
  }

  const admin = createClient(SUPABASE_URL, SERVICE);

  // The session decides the company — never the caller. A worker that could
  // name its own company_id could write into any tenant on the platform.
  // wa_rep_sessions, NOT whatsapp_baileys. That table is PRIMARY KEY
  // (company_id) — one row per company — and notify-provider, wa-provider.ts
  // and the admin ProviderPicker all read it with .maybeSingle(). A second row
  // per company would make all three error, stopping the founder's daily pulse.
  // A company's notification sender and a rep's read-only watcher are different
  // things; they get different tables, and only one of them can send.
  const { data: session, error: sErr } = await admin
    .from("wa_rep_sessions")
    .select("company_id, salesperson_id")
    .eq("salesperson_id", salespersonId)
    .maybeSingle();

  if (sErr) return json({ error: sErr.message }, 500);
  if (!session) return json({ error: "no observed session for this rep" }, 404);

  const companyId = session.company_id as string;
  let stored = 0;
  let skipped = 0;
  const rows: Record<string, unknown>[] = [];

  for (const raw of messages) {
    const m = raw as Record<string, unknown>;
    const peer = String(m.peer ?? "");
    const waId = String(m.id ?? "");
    const direction = m.direction === "in" ? "in" : "out";
    const sentAt = String(m.sent_at ?? "");
    if (!peer || !waId || !sentAt) { skipped++; continue; }

    // THE GATE. Not a lead in this company → this message does not exist to us.
    const { data: contactId } = await admin.rpc("match_wa_contact", {
      p_company: companyId,
      p_phone: peer,
    });
    if (!contactId) { skipped++; continue; }

    const text = typeof m.text === "string" ? m.text : "";
    // Older workers sent a bare boolean; keep reading it so a half-updated
    // fleet reports something sane rather than nothing.
    const kind = normaliseKind(m.media_kind) ?? (m.has_media === true ? "other" : null);

    rows.push({
      company_id: companyId,
      salesperson_id: salespersonId,
      contact_id: contactId,
      wa_message_id: waId,
      direction,
      // In full. A cap here would silently clip the one message an admin
      // actually needed to read, and the privacy question is settled upstream
      // by match_wa_contact, not by how many characters survive.
      body: text || null,
      has_media: kind !== null,
      media_kind: kind,
      // What the attachment actually was. WhatsApp does not keep the filename
      // anywhere reachable afterwards, so it is captured here or lost.
      file_name: typeof m.file_name === "string" ? m.file_name : null,
      mime_type: typeof m.mime_type === "string" ? m.mime_type : null,
      file_size: Number.isFinite(Number(m.file_size)) ? Number(m.file_size) : null,
      duration_seconds: Number.isFinite(Number(m.duration_seconds)) ? Number(m.duration_seconds) : null,
      peer_name: typeof m.peer_name === "string" ? m.peer_name : null,
      shared_details: direction === "out" && isDetails(text, kind),
      sent_at: sentAt,
    });
  }

  if (rows.length > 0) {
    // Idempotent: the worker may resend a batch after a network blip, and a
    // rep's day must not double-count because of it.
    const { error, count } = await admin
      .from("wa_observed_messages")
      .upsert(rows, { onConflict: "salesperson_id,wa_message_id", ignoreDuplicates: true, count: "exact" });
    if (error) return json({ error: error.message }, 500);
    stored = count ?? rows.length;
  }

  // ── WhatsApp calls ─────────────────────────────────────────────────────────
  //
  // The thing this feature was first asked for. Reps ring buyers on WhatsApp all
  // day and the SIM call log cannot see any of it, so those reps read as idle.
  //
  // Same privacy gate, same order: a call with anyone who is not a lead of this
  // company is dropped before it is stored, exactly like a message.
  const callRows: Record<string, unknown>[] = [];
  for (const raw of (Array.isArray(body?.calls) ? body.calls : []) as unknown[]) {
    const c = raw as Record<string, unknown>;
    const peer = String(c.peer ?? "");
    const callId = String(c.id ?? "");
    const at = String(c.at ?? "");
    if (!peer || !callId || !at) { skipped++; continue; }
    const { data: contactId } = await admin.rpc("match_wa_contact", {
      p_company: companyId,
      p_phone: peer,
    });
    if (!contactId) { skipped++; continue; }
    callRows.push({
      company_id: companyId,
      salesperson_id: salespersonId,
      contact_id: contactId,
      wa_call_id: callId,
      direction: c.direction === "out" ? "out" : "in",
      status: String(c.status ?? "offer"),
      video: c.video === true,
      started_at: at,
    });
  }
  let calls = 0;
  if (callRows.length > 0) {
    // WhatsApp reports one call several times as it rings, is answered, then
    // ends. Upserting on the call id keeps the LATEST state instead of three
    // rows for one conversation — so ignoreDuplicates is deliberately off here,
    // unlike messages, where the first version is the true one.
    const { error, count } = await admin
      .from("wa_observed_calls")
      .upsert(callRows, { onConflict: "salesperson_id,wa_call_id", count: "exact" });
    if (error) return json({ error: error.message }, 500);
    calls = count ?? callRows.length;
  }

  // ── read receipts ──────────────────────────────────────────────────────────
  //
  // Marks an inbound message as opened by the rep. "Has not replied" and "has
  // not even read it" are different conversations to have with a telecaller,
  // and only one of them is about priorities.
  //
  // No gate needed: this only ever updates a row that already passed the gate.
  // A receipt for a message that was never stored matches nothing and is a
  // no-op, which is the correct outcome for a non-lead.
  let receipts = 0;
  for (const raw of (Array.isArray(body?.receipts) ? body.receipts : []) as unknown[]) {
    const rc = raw as Record<string, unknown>;
    const waId = String(rc.id ?? "");
    if (!waId) continue;
    const { count } = await admin
      .from("wa_observed_messages")
      .update({ read_at: String(rc.read_at ?? new Date().toISOString()) }, { count: "exact" })
      .eq("salesperson_id", salespersonId)
      .eq("wa_message_id", waId)
      .is("read_at", null);
    receipts += count ?? 0;
  }

  // Liveness, so a session that logged out days ago shows up as stale in
  // v_rep_whatsapp_health instead of looking like a rep who stopped working.
  //
  // AND THE TRUTH ABOUT WHY NOTHING IS SHOWING UP.
  //
  // This endpoint is the only thing that knows the difference between the two
  // reasons a rep's lead pages are empty, and until now it kept that to itself:
  //
  //   nothing arrived at all           → the worker or the secret is broken
  //   plenty arrived, none were leads  → working perfectly, nothing to show
  //
  // The dashboard was guessing, and guessing wrong: a poll that once saw a
  // backlog wrote "the CRM is not accepting this worker's reports. Check
  // BAILEYS_INGEST_SECRET" into last_error, and nothing ever cleared it. That
  // sentence then survived four successful ingests, sent us to read edge logs,
  // and named a cause that was not true. A delivered batch now writes its own
  // outcome over the top.
  const note = stored === 0 && skipped > 0
    ? `Watching fine — ${skipped} message${skipped === 1 ? "" : "s"} seen, but none were with a ` +
      "lead of this company, so nothing was saved. Add the number as a lead to see the chat."
    : null;

  // The running total behind that sentence. One batch says "7 seen, none
  // matched"; the day's total is what tells a founder whether this rep is quiet
  // on WhatsApp or extremely busy on numbers that are not in the CRM. Counts
  // only — see migration 0172 for why nothing identifying is kept.
  await admin.rpc("wa_bump_activity", {
    p_company: companyId,
    p_salesperson: salespersonId,
    p_matched: stored,
    p_unmatched: skipped,
  });

  await admin
    .from("wa_rep_sessions")
    .update({
      last_seen_at: new Date().toISOString(),
      status: "connected",
      // Cleared on every successful ingest. A warning that outlives its cause
      // is worse than no warning, because it is read as current.
      last_error: note,
    })
    .eq("salesperson_id", salespersonId);

  return json({ ok: true, stored, skipped, calls, receipts });
});
