// Places a cloud call through UrOperator's click-to-call: UrOperator rings the
// agent's extension first, then bridges the customer. The agent extension and
// caller-ID (DID) are resolved server-side from the caller's profile / the
// company default, so the app only needs to send the customer's number.
//
// Body: { customer_phone, agent_id?, caller_id? }
//   agent_id / caller_id are optional overrides; otherwise taken from the
//   caller's profile (sip_agent_id / caller_id) then the company default.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { cors, json, requireUser, myProfile, loadIntegration, uroHeaders } from "../_shared/uro.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const caller = await requireUser(req);
  if (caller instanceof Response) return caller;

  const body = await req.json().catch(() => ({}));
  const customerPhone = String(body.customer_phone ?? "").trim();
  if (!customerPhone) return json({ ok: false, error: "customer_phone is required" });

  const profile = await myProfile(caller);
  if (!profile?.company_id) return json({ ok: false, error: "You are not linked to a company yet." });

  const integ = await loadIntegration(caller, profile.company_id);
  if (!integ?.uro_token) return json({ ok: false, error: "Cloud calling isn't configured for your company yet." });

  const agentId = String(body.agent_id ?? profile.sip_agent_id ?? "").trim();
  if (!agentId) return json({ ok: false, error: "No agent extension assigned. Ask your admin to set it." });
  const callerId = String(body.caller_id ?? profile.caller_id ?? integ.default_caller_id ?? "").trim();

  const base = (integ.api_base_url || "https://api.uroperator.com").replace(/\/+$/, "");

  try {
    const r = await fetch(`${base}/api/click-to-call`, {
      method: "POST",
      headers: uroHeaders(integ.uro_token),
      body: JSON.stringify({
        agent_id: agentId,
        customer_phone: customerPhone,
        ...(callerId ? { caller_id: callerId } : {}),
      }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.success === false) {
      return json({ ok: false, error: d.error || `UrOperator returned ${r.status}` });
    }
    return json({ ok: true, job_uuid: d.job_uuid, used_caller_id: d.used_caller_id });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 502);
  }
});
