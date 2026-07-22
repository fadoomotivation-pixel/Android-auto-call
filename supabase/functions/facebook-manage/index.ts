// Admin-only helper for the Facebook Lead Ads setup page.
// Actions (POST { action }):
//   "test"      → checks the saved page token: page reachable, page subscribed
//                 to the app for `leadgen`, and leads_retrieval permission
//                 (by listing lead forms). Returns per-check ok/label.
//   "subscribe" → subscribes the page to the app for the `leadgen` field so
//                 new leads webhook through, no manual Meta-dashboard step.
// The page access token lives in the Vault; it never reaches the browser.
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
    const company = profile?.company_id;
    if (!company) return json({ ok: false, error: "Your account isn't linked to a company yet." });

    const { action } = await req.json().catch(() => ({}));

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

    // "page_token" — the saved token is often a User / System-User token, but
    // page endpoints (subscribe, lead fetch) need a PAGE access token (Graph
    // error #190). Derive the page token from the saved one and re-save it. For
    // a System-User token this page token is long-lived (never expires).
    if (action === "page_token") {
      const r = await graph(`${pageId}?fields=access_token&access_token=${token}`);
      const pt = r.access_token as string | undefined;
      const e = r.error as { message?: string } | undefined;
      if (!pt) {
        return json({ ok: false, error: e?.message ?? "Couldn't get a Page token. The saved token must be a User or System-User token that has THIS page assigned, with pages_show_list + leads_retrieval." });
      }
      // Save via the USER's client so set_facebook_token sees auth.uid() (the
      // caller is the authorized admin/super-admin). The service-role client has
      // no auth.uid(), which the RPC rejects with "not authorized".
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
