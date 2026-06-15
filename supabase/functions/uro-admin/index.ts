// Admin-side UrOperator helper. Lets a company admin (or super admin) verify
// their UrOperator integration and list the agents / caller-IDs provisioned on
// the UrOperator side — WITHOUT ever exposing the FS_ token to the browser.
// The token is read server-side (service role) from company_integrations.
//
// Body: { action: "test" | "agents" | "caller-ids", company_id?: string }
//   - company_id is optional; defaults to the caller's own company. A super
//     admin may pass another company_id to configure on their behalf.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { cors, json, requireUser, myProfile, loadIntegration, uroHeaders } from "../_shared/uro.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const caller = await requireUser(req);
  if (caller instanceof Response) return caller;

  const body = await req.json().catch(() => ({}));
  const action: string = body.action ?? "test";

  const profile = await myProfile(caller);
  if (!profile) return json({ ok: false, error: "No profile" }, 403);

  // Super admins may target any company; company admins only their own.
  const { data: pa } = await caller.admin
    .from("platform_admins").select("user_id").eq("user_id", caller.userId).maybeSingle();
  const isSuper = !!pa;
  const isAdmin = profile.role === "admin";
  if (!isAdmin && !isSuper) return json({ ok: false, error: "Admins only" }, 403);

  const companyId: string | null = (isSuper && body.company_id) ? body.company_id : profile.company_id;
  if (!companyId) return json({ ok: false, error: "No company" }, 400);

  const integ = await loadIntegration(caller, companyId);
  if (!integ?.uro_token) {
    return json({ ok: false, error: "No UrOperator token set for this company yet." });
  }
  const base = (integ.api_base_url || "https://api.uroperator.com").replace(/\/+$/, "");
  const headers = uroHeaders(integ.uro_token);

  try {
    if (action === "test") {
      const [statusRes, tokenRes] = await Promise.all([
        fetch(`${base}/api/status`, { headers }),
        fetch(`${base}/api/token/info`, { headers }),
      ]);
      const status = await statusRes.json().catch(() => ({}));
      const token = await tokenRes.json().catch(() => ({}));
      const ok = statusRes.ok && tokenRes.ok;
      return json({
        ok,
        status,
        token: ok ? { client_name: token.client_name, tenant_id: token.tenant_id, expires_at: token.expires_at, status: token.status } : null,
        error: ok ? null : (token.error || `UrOperator returned ${tokenRes.status}`),
      });
    }

    if (action === "agents") {
      // registration-info carries both the SIP server details and per-agent creds.
      const r = await fetch(`${base}/api/sip/registration-info`, { headers });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return json({ ok: false, error: d.error || `UrOperator returned ${r.status}` });
      const agents = (d.agents ?? []).map((a: Record<string, unknown>) => ({
        username: a.username, name: a.name,
      }));
      return json({
        ok: true,
        sip_server: d.sip_server, sip_port: d.sip_port, transport: d.transport,
        domain: d.domain, outbound_proxy: d.outbound_proxy, agents,
      });
    }

    if (action === "caller-ids") {
      const r = await fetch(`${base}/api/caller-ids`, { headers });
      const d = await r.json().catch(() => ([]));
      if (!r.ok) return json({ ok: false, error: (d as { error?: string }).error || `UrOperator returned ${r.status}` });
      return json({ ok: true, caller_ids: Array.isArray(d) ? d : [] });
    }

    return json({ ok: false, error: `Unknown action "${action}"` }, 400);
  } catch (e) {
    return json({ ok: false, error: String(e) }, 502);
  }
});
