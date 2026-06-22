// Places an outbound call through CallerDesk's click-to-call bridge.
// CallerDesk rings the agent's own mobile (calling_party_a) first, then dials
// the customer (calling_party_b) and bridges them, showing the company's
// deskphone (virtual number) as caller ID. The call is recorded server-side;
// the result arrives later via callerdesk-webhook.
//
// Body: { customer_phone, contact_id?, campaign_id?, call_log_id? }
//   - call_log_id: attach to an existing log (the app pre-logs the call); else a
//     new call_log row is created here.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { cors, json, requireUser } from "../_shared/uro.ts";
import { CALLERDESK_CLICK_TO_CALL, tenDigit, pick } from "../_shared/callerdesk.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const caller = await requireUser(req);
  if (caller instanceof Response) return caller;

  const body = await req.json().catch(() => ({}));
  const customerPhone = String(body.customer_phone ?? "").trim();
  if (!customerPhone) return json({ ok: false, error: "customer_phone is required" });

  // The agent's own mobile is calling_party_a. It lives on their profile.
  const { data: profile } = await caller.u
    .from("profiles")
    .select("company_id, phone, full_name")
    .eq("id", caller.userId)
    .maybeSingle();
  if (!profile?.company_id) return json({ ok: false, error: "You are not linked to a company yet." });

  const agentMobile = tenDigit(profile.phone);
  if (agentMobile.length !== 10) {
    return json({ ok: false, error: "Set your 10-digit mobile number in your profile to place calls." });
  }

  // Company config + authcode (authcode comes from Vault via a service-role RPC).
  const { data: integ } = await caller.admin
    .from("company_integrations")
    .select("callerdesk_deskphone, call_provider")
    .eq("company_id", profile.company_id)
    .maybeSingle();
  const deskphone = String(integ?.callerdesk_deskphone ?? "").trim();
  if (!deskphone) {
    return json({ ok: false, error: "CallerDesk isn't configured for your company (missing deskphone)." });
  }
  const { data: authcode } = await caller.admin.rpc("get_callerdesk_authcode", { p_company: profile.company_id });
  if (!authcode) {
    return json({ ok: false, error: "CallerDesk isn't configured for your company (missing authcode)." });
  }

  // Use the app-provided log, or create one now so the webhook has a row to match.
  let callLogId = String(body.call_log_id ?? "").trim() || null;
  if (!callLogId) {
    const { data: row } = await caller.admin
      .from("call_logs")
      .insert({
        company_id: profile.company_id,
        salesperson_id: caller.userId,
        contact_id: body.contact_id ?? null,
        campaign_id: body.campaign_id ?? null,
        phone: customerPhone,
        direction: "outgoing",
        notes: "callerdesk",
        started_at: new Date().toISOString(),
        recording_source: "callerdesk",
        recording_status: "none",
      })
      .select("id")
      .maybeSingle();
    callLogId = row?.id ?? null;
  }

  // Fire the click-to-call. Documented as GET with query params.
  const url = new URL(CALLERDESK_CLICK_TO_CALL);
  url.searchParams.set("calling_party_a", agentMobile);
  url.searchParams.set("calling_party_b", tenDigit(customerPhone));
  url.searchParams.set("deskphone", deskphone);
  url.searchParams.set("call_from_did", "1");
  url.searchParams.set("authcode", String(authcode));

  try {
    const r = await fetch(url.toString(), { method: "GET" });
    const text = await r.text();
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }

    // Correlate the eventual webhook: store whatever id-like field came back.
    const providerCallId = pick(parsed, ["campid", "camp_id", "callid", "call_id", "ucid", "uuid", "id", "request_id", "txn_id"]);
    if (callLogId && providerCallId) {
      await caller.admin.from("call_logs").update({ provider_call_id: providerCallId }).eq("id", callLogId);
    }

    const ok = r.ok && !/fail|error|invalid/i.test(text);
    return json({
      ok,
      call_log_id: callLogId,
      provider_call_id: providerCallId,
      provider_status: r.status,
      provider_response: parsed,
    });
  } catch (e) {
    return json({ ok: false, call_log_id: callLogId, error: String(e) }, 502);
  }
});
