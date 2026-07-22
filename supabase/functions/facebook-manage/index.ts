// Admin-only helper for the Facebook Lead Ads setup page.
// Actions (POST { action }):
//   "test"       → page reachable, page subscribed for `leadgen`, leads_retrieval.
//   "subscribe"  → subscribes the page to the app for the `leadgen` field.
//   "page_token" → derives + saves a PAGE token from a User/System-User token.
//   "test_capi"  → sends one event to the CAPI dataset to prove the token works.
// Tokens live in the Vault; they never reach the browser.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GRAPH = "https://graph.facebook.com/v19.0";

function json(o: unknown, s = 200) {
  return new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
}
async function sha256(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function graph(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
  try {
    return await fetch(`${GRAPH}/${path}`, init).then((r) => r.json());
  } catch (e) {
    return { error: { message: String(e) } };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const u = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
    const { data: ud } = await u.auth.getUser();
    if (!ud?.user) return json({ ok: false, error: "Unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE);
    const { data: profile } = await admin.from("profiles").select("company_id, role").eq("id", ud.user.id).maybeSingle();
    const { data: pa } = await admin.from("platform_admins").select("user_id").eq("user_id", ud.user.id).maybeSingle();
    if (profile?.role !== "admin" && !pa) return json({ ok: false, error: "Admins only" }, 403);

    const body = await req.json().catch(() => ({}));
    const { action } = body;
    // The super admin serves EVERY company equally — they may pass company_id
    // to manage any tenant's integration. A regular admin is always pinned to
    // their own company (the override is ignored for them).
    let company = profile?.company_id as string | null | undefined;
    if (pa && typeof body.company_id === "string" && body.company_id) company = body.company_id;
    if (!company) return json({ ok: false, error: "Your account isn't linked to a company yet." });

    // CAPI test needs no page token — handle it before the page-token gate.
    if (action === "test_capi") {
      const { data: cfg } = await admin.rpc("get_facebook_capi", { p_company: company });
      if (!cfg || !cfg.dataset_id || !cfg.token) {
        return json({ ok: false, error: "CAPI not set up — add the Dataset ID and Conversions API Token in Step 3, then Save." });
      }
      const payload = {
        data: [{
          event_name: "QualifiedLead",
          event_time: Math.floor(Date.now() / 1000),
          action_source: "system_generated",
          event_id: `capi-selftest-${Date.now()}`,
          user_data: { em: [await sha256("capi-selftest@callproai.in")] },
          custom_data: { event_source: "call_pro_ai_test" },
        }],
      };
      const res = await fetch(`${GRAPH}/${cfg.dataset_id}/events?access_token=${encodeURIComponent(cfg.token)}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const txt = await res.text();
      let received = 0, errMsg = "";
      try { const j = JSON.parse(txt); received = j.events_received ?? 0; errMsg = j.error?.message ?? ""; } catch { errMsg = txt.slice(0, 300); }
      if (res.ok && received > 0) return json({ ok: true, received, dataset: cfg.dataset_id });
      return json({ ok: false, error: errMsg || `CAPI test failed (${res.status})` });
    }

    const { data: integ } = await admin.from("facebook_integrations").select("page_id").eq("company_id", company).maybeSingle();
    if (!integ?.page_id) return json({ ok: false, error: "Save your Page ID first." });
    const { data: token, error: tokErr } = await admin.rpc("get_facebook_token", { p_company: company });
    if (tokErr || !token) return json({ ok: false, error: "No Page Access Token saved. Add it in Step 2." });
    const pageId = String(integ.page_id);

    if (action === "subscribe") {
      const j = await graph(`${pageId}/subscribed_apps?subscribed_fields=leadgen&access_token=${token}`, { method: "POST" });
      const e = j.error as { message?: string } | undefined;
      if (e) return json({ ok: false, error: e.message ?? "Subscribe failed. Check the token's permissions." });
      return json({ ok: true, subscribed: true });
    }

    if (action === "page_token") {
      const r = await graph(`${pageId}?fields=access_token&access_token=${token}`);
      const pt = r.access_token as string | undefined;
      const e = r.error as { message?: string } | undefined;
      if (!pt) {
        return json({ ok: false, error: e?.message ?? "Couldn't get a Page token. The saved token must be a User or System-User token that has THIS page assigned, with pages_show_list + leads_retrieval." });
      }
      const { error: sErr } = await u.rpc("set_facebook_token", { p_company: company, p_token: pt });
      if (sErr) return json({ ok: false, error: "Got the Page token but couldn't save it: " + sErr.message });
      return json({ ok: true, converted: true });
    }

    // Default: "test" — three independent checks.
    const page = await graph(`${pageId}?fields=name&access_token=${token}`);
    const pageErr = page.error as { message?: string } | undefined;
    const pageOk = !pageErr;

    const subs = await graph(`${pageId}/subscribed_apps?access_token=${token}`);
    const subsErr = subs.error as { message?: string } | undefined;
    const subsData = subs.data as { subscribed_fields?: string[] }[] | undefined;
    const subscribedLeadgen = Array.isArray(subsData) && subsData.some((a) => (a.subscribed_fields ?? []).includes("leadgen"));

    const forms = await graph(`${pageId}/leadgen_forms?limit=1&access_token=${token}`);
    const formsErr = forms.error as { message?: string } | undefined;

    return json({
      ok: true,
      checks: {
        token: { ok: pageOk, label: pageOk ? `Page connected: ${page.name}` : (pageErr?.message ?? "Token invalid") },
        subscription: { ok: subscribedLeadgen, label: subscribedLeadgen ? "Page subscribed for leadgen" : (subsErr?.message ?? "Page not subscribed to the app for leadgen") },
        permission: { ok: !formsErr, label: !formsErr ? "leads_retrieval permission OK" : (formsErr?.message ?? "leads_retrieval permission missing") },
      },
    });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
