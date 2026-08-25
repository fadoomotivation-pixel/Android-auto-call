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
//         "text": "...", "has_media": false, "sent_at": "2026-08-20T09:12:00Z" } ] }
//
// THREE RULES, ENFORCED HERE RATHER THAN TRUSTED TO THE CALLER
//
// 1. A message is stored ONLY if the other party is a lead in this rep's own
//    company. match_wa_contact returns null for anyone else and the message is
//    dropped unread — never logged, never counted, never persisted. A rep's
//    family, friends and salary conversations do not enter this database. This
//    is the rule that makes observing a rep's personal number acceptable at all.
//
// 2. Only 300 characters of body are kept. An admin needs to see that project
//    details went out, not to read a rep's conversations over their shoulder.
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

/**
 * Did this message carry the project details a buyer asked for?
 *
 * Evidence only — a link or an attachment. Not a guess from the wording: an
 * admin is going to judge a telecaller's day on this number, so it has to mean
 * something specific rather than "the message mentioned a project".
 */
function looksLikeDetails(text: string, hasMedia: boolean): boolean {
  if (hasMedia) return true;
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
  if (messages.length === 0) return json({ ok: true, stored: 0, skipped: 0 });

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
    const hasMedia = m.has_media === true;

    rows.push({
      company_id: companyId,
      salesperson_id: salespersonId,
      contact_id: contactId,
      wa_message_id: waId,
      direction,
      body_preview: text.slice(0, 300) || null,
      has_media: hasMedia,
      shared_details: direction === "out" && looksLikeDetails(text, hasMedia),
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

  // Liveness, so a session that logged out days ago shows up as stale in
  // v_rep_whatsapp_health instead of looking like a rep who stopped working.
  await admin
    .from("wa_rep_sessions")
    .update({ last_seen_at: new Date().toISOString(), status: "connected" })
    .eq("salesperson_id", salespersonId);

  return json({ ok: true, stored, skipped });
});
