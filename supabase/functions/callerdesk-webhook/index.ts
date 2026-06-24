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
  // CallerDesk appends "?type=<event>" to the configured URL, which mangles the
  // token query-param into "<token>?type=call_report". Keep only the real token,
  // and recover the event type from the leftover.
  const rawToken = url.searchParams.get("token") ?? req.headers.get("x-webhook-token") ?? "";
  const token = rawToken.split("?")[0].trim();
  if (!token) return new Response("missing token", { status: 400 });
  const eventType = (rawToken.match(/[?&]type=([a-z_]+)/i)?.[1] ??
    pick({ t: url.searchParams.get("type") ?? "" }, ["t"]) ?? "").toLowerCase();

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

  // 2. Best-effort field extraction. CallerDesk uses CamelCase: CallSid,
  //    CallRecordingUrl, CallDuration/TalkDuration, SourceNumber, Status/callstatus.
  const providerCallId = pick(payload, ["campid", "camp_id", "callsid", "call_sid", "uniqueid", "callid", "call_id", "ucid", "uuid", "id"]);
  const recordingUrl = pick(payload, [
    "callrecordingurl", "call_recording_url", "recording_url", "recordingurl",
    "recording", "recording_file", "voice_file", "file", "audio_url", "audiourl",
  ]);
  // Prefer talk time (actual conversation) over total call time (incl. ringing).
  const durationStr = pick(payload, ["talkduration", "talktime", "billsec", "callduration", "call_duration", "duration", "duration_seconds"]);
  const status = pick(payload, ["callstatus", "status", "call_status", "dialstatus", "disposition"]);
  const directionRaw = pick(payload, ["direction", "call_type", "calltype"]);
  // CallerDesk: WEBOBD = outbound, IVR = inbound. Default to outgoing.
  const direction = directionRaw ? (/(^in|inbound|incoming|ibd|ivr)/i.test(directionRaw) ? "incoming" : "outgoing") : null;
  // The customer's number sits on a different leg per direction: an outbound
  // call rings DialWhomNumber; an inbound call comes FROM SourceNumber.
  const customer = direction === "incoming"
    ? pick(payload, ["sourcenumber", "calling_party_a", "from", "caller", "customer_number"])
    : pick(payload, ["dialwhomnumber", "dial_whom_number", "calling_party_b", "destination", "to", "called_number", "customer_number", "client_number"]);
  const duration = durationStr ? Math.max(0, parseInt(durationStr, 10) || 0) : null;
  // "Answered" must NOT match " No Answer" / cancel / congestion.
  const answered = /^answer(ed)?$/i.test((status ?? "").trim());
  // Only the terminal "call report" carries the recording + final disposition;
  // intermediate "live_call" events must not flip the status.
  const isReport = eventType === "call_report" || recordingUrl != null;

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
  // Inbound call: the customer dialed your CallerDesk deskphone and CallerDesk
  // routed it to an agent's mobile (DialWhomNumber). There's no app-created row
  // to match, so attribute it to that agent (by their profile phone) and create
  // the log here — that's how incoming calls land in the CRM with their recording.
  if (!callLogId && isReport && direction === "incoming") {
    const agentNum = pick(payload, ["dialwhomnumber", "dial_whom_number", "calling_party_a", "destinationnumber"]);
    const agent10 = tenDigit(agentNum ?? "");
    if (agent10.length === 10) {
      const { data: members } = await admin.from("profiles").select("id, phone").eq("company_id", companyId);
      const agent = (members ?? []).find((m) => tenDigit(m.phone as string) === agent10);
      if (agent) {
        // Link to an existing lead with the customer's number, if any.
        let contactId: string | null = null;
        if (customer) {
          const cust10 = tenDigit(customer);
          const { data: contacts } = await admin.from("contacts").select("id, phone")
            .eq("company_id", companyId).limit(200);
          contactId = (contacts ?? []).find((c) => tenDigit(c.phone as string) === cust10)?.id ?? null;
        }
        const { data: created } = await admin.from("call_logs").insert({
          company_id: companyId,
          salesperson_id: agent.id,
          contact_id: contactId,
          phone: customer ?? agentNum,
          direction: "incoming",
          notes: "callerdesk-inbound",
          started_at: new Date().toISOString(),
          recording_source: "callerdesk",
          recording_status: "none",
        }).select("id").maybeSingle();
        callLogId = created?.id ?? null;
      }
    }
  }
  // If still unmatched (e.g. an inbound call to an unknown agent, or a webhook
  // that beat the call row), we do NOT fabricate a row — the raw event is kept in
  // callerdesk_events for later reconciliation.

  if (callLogId) {
    const patch: Record<string, unknown> = { provider_call_id: providerCallId ?? undefined };
    if (duration !== null && duration > 0) { patch.duration_seconds = duration; patch.recording_seconds = duration; }
    if (direction) patch.direction = direction;
    if (isReport) {
      if (answered && recordingUrl) {
        patch.recording_url = recordingUrl;
        patch.recording_status = "ready";
        patch.recording_error = null;
      } else {
        // Missed / cancelled / congestion — no usable recording.
        patch.recording_status = "failed";
        patch.recording_error = `CallerDesk: ${(status ?? "no answer").trim()}`;
      }
    }
    await admin.from("call_logs").update(patch).eq("id", callLogId);
    if (ev?.id) await admin.from("callerdesk_events").update({ call_log_id: callLogId }).eq("id", ev.id);

    // 4. Pull the recording and summarise (answered calls only; background ack).
    if (isReport && answered && recordingUrl && hasGroq()) {
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
