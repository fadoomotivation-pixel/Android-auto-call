// Returns the SIP credentials the salesperson app needs to register its native
// softphone (Linphone) and place cloud calls. The app calls this on each cloud
// call. The FS_ token never leaves the server: we read it via the service role,
// ask UrOperator for the per-agent password, and return only this agent's creds.
//
// Response shape matches the app's WebrtcConfig model:
//   { ok, ext, password, wss, domain, sip_server, sip_port, transport, error? }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { cors, json, requireUser, myProfile, loadIntegration, uroHeaders } from "../_shared/uro.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const caller = await requireUser(req);
  if (caller instanceof Response) return caller;

  const profile = await myProfile(caller);
  if (!profile?.company_id) return json({ ok: false, error: "You are not linked to a company yet." });
  const ext = profile.sip_agent_id?.trim();
  if (!ext) return json({ ok: false, error: "No agent extension assigned. Ask your admin to set it." });

  const integ = await loadIntegration(caller, profile.company_id);
  if (!integ?.uro_token) return json({ ok: false, error: "Cloud calling isn't configured for your company yet." });

  const base = (integ.api_base_url || "https://api.uroperator.com").replace(/\/+$/, "");

  // Pull this agent's SIP password from UrOperator (per-agent creds).
  let password = "";
  let regServer = integ.sip_server;
  let regPort = integ.sip_port;
  let regTransport = integ.transport;
  let domain = integ.sip_server;
  try {
    const r = await fetch(`${base}/api/sip/registration-info`, { headers: uroHeaders(integ.uro_token) });
    if (r.ok) {
      const d = await r.json();
      const agent = (d.agents ?? []).find((a: Record<string, unknown>) => String(a.username) === ext);
      if (agent) password = String(agent.password ?? "");
      // Prefer the server-reported SIP details, falling back to the stored config.
      regServer = d.sip_server || regServer;
      regPort = d.sip_port || regPort;
      regTransport = d.transport || regTransport;
      domain = d.domain || regServer;
    }
  } catch (_e) { /* fall through with stored config */ }

  // Per-agent overrides win (e.g. a private PBX address for one rep).
  const sipServer = profile.sip_server?.trim() || regServer;
  const sipPort = profile.sip_port || regPort;

  return json({
    ok: true,
    ext,
    password,
    wss: integ.wss_url ?? "",
    domain,
    sip_server: sipServer,
    sip_port: sipPort,
    transport: (regTransport || "udp").toLowerCase(),
    error: password ? null : "Agent has no SIP password on UrOperator yet — create the agent there first.",
  });
});
