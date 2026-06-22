// Receives CallerDesk call-report webhooks (configured in CallerDesk Dashboard →
// API & Integration → Webhooks). The URL must carry ?token=<company webhook
// token> so we can scope the event to one company without auth.
//
// What it does, defensively (CallerDesk field names vary by account/plan):
//   1. Identify the company from the token.
//   2. Store the RAW payload in callerdesk_events (so the exact field names are
//      captured on the very first real call — nothing is ever lost).
//   3. Best-effort extract status / duration / recording URL / call id.
//   4. Match it to a call_logs row (by provider_call_id, else recent phone match,
//      else insert a new row — e.g. for inbound calls).
//   5. If a recording URL is present, pull it and run the Groq summary pipeline.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { adminClient, pick, tenDigit } from "../_shared/callerdesk.ts";
import { hasGroq, summarizeAndStore } from "../_shared/summarize.ts";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

function ok(body: unknown = { ok: true }) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

async function readPayload(req: Request, url: URL): Promise<Record<string, unknown>> {
  const q: Record<string, unknown> = {};
  for (const [k, v] of url.searchParams.entries()) if (k !== "token") q[k] = v;
  if (req.method === "GET") return q;
  const ct = req.headers.get("content-type") ?? "";
  try {
    if (ct.includes("application/json")) return { ...q, ...(await req.json()) };
    if (ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data")) {
      const form = await req.formData();
      const o: Record<string, unknown> = { ...q };
      for (const [k, v] of form.entries()) o[k] = typeof v === "string" ? v : "(file)";
      return o;
    }
    const text = await req.text();
    try { return { ...q, ...JSON.parse(text) }; } catch { return { ...q, raw: text }; }
  } catch {
    return q;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return ok();
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? req.headers.get("x-webhook-token") ?? "";
  if (!token) return new Response("missing token", { status: 400 });

  const admin = adminClient();
  const { data: integ } = await admin
    .from("company_integrations")
    .select("company_id")
    .eq("callerdesk_webhook_token", token)
    .maybeSingle();
  if (!integ?.company_id) return new Response("unknown token", { status: 403 });
  const companyId = integ.company_id as string;

  const payload = await readPayload(req, url);

  // 1. Always persist the raw event first — this is our ground truth.
  const { data: ev } = await admin
    .from("callerdesk_events")
    .insert({ company_id: companyId, payload })
    .select("id")
    .maybeSingle();

  // 2. Best-effort field extraction.
  const providerCallId = pick(payload, ["callid", "call_id", "ucid", "uuid", "id", "request_id", "txn_id"]);
  const recordingUrl = pick(payload, [
    "recording_url", "recordingurl", "recording", "recording_file", "recordingfile",
    "voice_file", "voicefile", "file", "recording_path", "audio_url", "audiourl",
  ]);
  const durationStr = pick(payload, ["duration", "call_duration", "billsec", "duration_seconds", "talktime", "conversation_duration"]);
  const status = pick(payload, ["status", "call_status", "callstatus", "dialstatus", "disposition", "call_report"]);
  const customer = pick(payload, ["calling_party_b", "customer_number", "customer", "destination", "to", "called_number", "client_number"]);
  const directionRaw = pick(payload, ["direction", "call_type", "calltype", "type"]);
  const duration = durationStr ? Math.max(0, parseInt(durationStr, 10) || 0) : null;
  const direction = directionRaw
    ? (/in/i.test(directionRaw) ? "incoming" : "outgoing")
    : null;

  // 3. Find the call_log to update.
  let callLogId: string | null = null;
  if (providerCallId) {
    const { data } = await admin.from("call_logs").select("id")
      .eq("company_id", companyId).eq("provider_call_id", providerCallId).maybeSingle();
    callLogId = data?.id ?? null;
  }
  if (!callLogId && customer) {
    // Most recent outgoing log for this number, not yet linked, within 30 min.
    const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const cust = tenDigit(customer);
    const { data } = await admin.from("call_logs").select("id, phone, created_at")
      .eq("company_id", companyId).is("provider_call_id", null)
      .gte("created_at", since).order("created_at", { ascending: false }).limit(20);
    callLogId = (data ?? []).find((r) => tenDigit(r.phone as string) === cust)?.id ?? null;
  }
  // If still unmatched (e.g. a true inbound call, or a webhook that beat the
  // call row), we do NOT fabricate a row: call_logs.salesperson_id is NOT NULL
  // and the app deserialises it as non-null, so an unattributed row would break
  // call-list loading. The raw event is already persisted in callerdesk_events
  // for later reconciliation / inbound routing.

  if (callLogId) {
    const patch: Record<string, unknown> = { provider_call_id: providerCallId ?? undefined };
    if (duration !== null) { patch.duration_seconds = duration; patch.recording_seconds = duration; }
    if (direction) patch.direction = direction;
    if (recordingUrl) { patch.recording_url = recordingUrl; patch.recording_status = "ready"; patch.recording_error = null; }
    else if (status && /fail|no.?answer|busy|reject|miss/i.test(status)) { patch.recording_status = "failed"; patch.recording_error = `CallerDesk status: ${status}`; }
    await admin.from("call_logs").update(patch).eq("id", callLogId);
    if (ev?.id) await admin.from("callerdesk_events").update({ call_log_id: callLogId }).eq("id", ev.id);

    // 4. Pull the recording and summarise (background, so we ack the webhook fast).
    if (recordingUrl && hasGroq()) {
      const task = (async () => {
        try {
          const r = await fetch(recordingUrl);
          if (!r.ok) { console.error(`callerdesk recording fetch ${r.status} for ${callLogId}`); return; }
          const bytes = new Uint8Array(await r.arrayBuffer());
          if (bytes.length > 0) await summarizeAndStore(admin, callLogId!, bytes, "callerdesk");
        } catch (e) {
          console.error(`callerdesk summary error for ${callLogId}: ${e}`);
        }
      })();
      if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(task); else await task;
    }
  }

  return ok({ ok: true, call_log_id: callLogId });
});
