// Ads Manager — READ mode + CRM attribution.
//
// Pulls campaign/ad performance from the Meta Marketing API for the central ad
// account, then joins it to OUR CRM outcomes: for each ad, how many of its leads
// became Qualified / Booked (matched via contacts.extra.ad_id, which the
// facebook-webhook stores on every lead). That downstream truth is the thing Meta
// itself can't show — it only knows form-fills, not which leads actually convert.
//
// Body: { company, date_preset? }  (company = hub company holding the ads token)
// Auth: a signed-in admin or platform super admin.
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
const GRAPH = "https://graph.facebook.com/v21.0";

function json(o: unknown, s = 200) {
  return new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
}

// Which funnel stages count as Qualified / Booked now lives in ONE place — the
// ad_lead_autopsy SQL function — because the same question is asked by the
// autopsy breakdown. Two copies of "what counts as qualified" is how two panels
// on the same page start disagreeing about the same ad.

const PRESET_SINCE: Record<string, () => number> = {
  today: () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); },
  last_7d: () => Date.now() - 7 * 864e5,
  last_30d: () => Date.now() - 30 * 864e5,
  this_month: () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).getTime(); },
};

function num(v: unknown): number { const n = Number(v); return Number.isFinite(n) ? n : 0; }

// Sum Meta "lead" conversions out of the insights actions array.
function metaLeads(actions: { action_type?: string; value?: string }[] | undefined): number {
  if (!Array.isArray(actions)) return 0;
  let n = 0;
  for (const a of actions) if ((a.action_type ?? "").includes("lead")) n += num(a.value);
  return n;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const u = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
    const { data: ud } = await u.auth.getUser();
    if (!ud?.user) return json({ ok: false, error: "Unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE);
    const { data: profile } = await admin.from("profiles").select("role").eq("id", ud.user.id).maybeSingle();
    const { data: pa } = await admin.from("platform_admins").select("user_id").eq("user_id", ud.user.id).maybeSingle();
    if (profile?.role !== "admin" && !pa) return json({ ok: false, error: "Admins only" }, 403);

    const { company, date_preset, time_range, breakdown } = await req.json().catch(() => ({}));
    if (!company) return json({ ok: false, error: "missing company" }, 400);
    const preset = PRESET_SINCE[date_preset] ? date_preset : "last_30d";

    // Custom range wins over a preset. `timeParam` goes straight into the Graph
    // URL; `sinceMs` bounds the CRM attribution window.
    const custom = time_range && typeof time_range.since === "string" && typeof time_range.until === "string";
    const timeParam = custom
      ? `time_range=${encodeURIComponent(JSON.stringify({ since: time_range.since, until: time_range.until }))}`
      : `date_preset=${preset}`;
    const sinceMs = custom ? Date.parse(`${time_range.since}T00:00:00Z`) : PRESET_SINCE[preset]();
    const untilIso = custom ? new Date(Date.parse(`${time_range.until}T23:59:59Z`)).toISOString() : null;

    const { data: cfg } = await admin.rpc("get_facebook_ads", { p_company: company });
    if (!cfg || !cfg.ad_account_id || !cfg.token) {
      return json({ ok: false, error: "Ads account not set up — add the Ad Account ID and Marketing-API token, then Save." });
    }
    const acct = String(cfg.ad_account_id).replace(/^act_/, "");
    const token = String(cfg.token);

    // Account currency (so the UI shows the right symbol).
    const acctRes = await fetch(`${GRAPH}/act_${acct}?fields=name,currency&access_token=${encodeURIComponent(token)}`).then((r) => r.json()).catch(() => ({}));
    if (acctRes.error) return json({ ok: false, error: acctRes.error.message ?? "Couldn't read the ad account. Check the Ad Account ID and token permissions (ads_read)." });
    const currency = acctRes.currency ?? "";

    // ---- Breakdown mode: compare what's working (placement / audience / region /
    // device / ad set). Meta-only metrics — CRM attribution isn't available per
    // breakdown dimension, so these show reach/CTR/CPC/spend for comparison. ----
    if (breakdown) {
      const MAP: Record<string, { level: string; breakdowns: string; keys: string[] }> = {
        placement: { level: "account", breakdowns: "publisher_platform,platform_position", keys: ["publisher_platform", "platform_position"] },
        audience: { level: "account", breakdowns: "age,gender", keys: ["age", "gender"] },
        region: { level: "account", breakdowns: "region", keys: ["region"] },
        device: { level: "account", breakdowns: "impression_device", keys: ["impression_device"] },
        adset: { level: "adset", breakdowns: "", keys: ["adset_name"] },
        creative: { level: "ad", breakdowns: "", keys: ["ad_name"] },
      };
      const bd = MAP[String(breakdown)] ?? MAP.placement;
      const bf = `impressions,clicks,spend,ctr,cpc${bd.level === "adset" ? ",adset_name" : bd.level === "ad" ? ",ad_name" : ""}`;
      const bUrl = `${GRAPH}/act_${acct}/insights?level=${bd.level}&${timeParam}&fields=${bf}` +
        `${bd.breakdowns ? `&breakdowns=${bd.breakdowns}` : ""}&limit=500&access_token=${encodeURIComponent(token)}`;
      const bRes = await fetch(bUrl).then((r) => r.json()).catch(() => ({}));
      if (bRes.error) return json({ ok: false, error: bRes.error.message ?? "Couldn't read breakdown insights." });
      const bRows = (bRes.data ?? []).map((r: Record<string, unknown>) => ({
        key: bd.keys.map((k) => r[k]).filter(Boolean).join(" · ") || "(unknown)",
        impressions: num(r.impressions), clicks: num(r.clicks), spend: num(r.spend),
        ctr: num(r.ctr), cpc: num(r.cpc),
      })).sort((a, b) => b.spend - a.spend);
      return json({ ok: true, currency, breakdown, rows: bRows });
    }

    // Campaign statuses / budgets (insights alone don't return these).
    const campRes = await fetch(`${GRAPH}/act_${acct}/campaigns?fields=id,name,effective_status,daily_budget,lifetime_budget&limit=500&access_token=${encodeURIComponent(token)}`).then((r) => r.json()).catch(() => ({}));
    const campMeta: Record<string, { status: string; daily: number; lifetime: number }> = {};
    for (const c of campRes.data ?? []) {
      campMeta[String(c.id)] = { status: c.effective_status ?? "", daily: num(c.daily_budget) / 100, lifetime: num(c.lifetime_budget) / 100 };
    }

    // Ad-level insights for the window.
    const fields = "ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,impressions,clicks,spend,ctr,cpc,frequency,actions";
    const insRes = await fetch(`${GRAPH}/act_${acct}/insights?level=ad&${timeParam}&fields=${fields}&limit=500&access_token=${encodeURIComponent(token)}`).then((r) => r.json()).catch(() => ({}));
    if (insRes.error) return json({ ok: false, error: insRes.error.message ?? "Couldn't read ad insights (ads_read permission?)." });

    // CRM attribution + the autopsy behind each ad's grade, in one call.
    //
    // This used to page through contacts here and count leads/qualified/booked
    // by hand. It now asks ad_lead_autopsy, which counts the same rows by the
    // same rule (facebook source, extra.ad_id, same window) and ALSO returns
    // what happened to the leads that didn't qualify — never called, called but
    // never reached, said no — plus how long the first dial took.
    //
    // That extra detail is the difference between "this ad is a D" and knowing
    // whether the ad brought the wrong people or nobody worked the leads. Both
    // score D; only one is fixed by changing the ad.
    const since = new Date(sinceMs).toISOString();
    type Autopsy = {
      ad_id: string; leads: number; never_called: number; tried_not_reached: number;
      spoke: number; qualified: number; booked: number; not_interested: number;
      wrong_or_dnc: number; still_open: number; median_first_call_mins: number;
    };
    const crm: Record<string, Autopsy> = {};
    {
      const { data: ap } = await admin.rpc("ad_lead_autopsy", {
        p_since: since,
        p_until: untilIso ?? null,
      });
      for (const r of (ap ?? []) as Autopsy[]) crm[String(r.ad_id)] = r;
    }

    const rows = (insRes.data ?? []).map((r: Record<string, unknown>) => {
      const adId = String(r.ad_id ?? "");
      const c = crm[adId];
      const campId = String(r.campaign_id ?? "");
      return {
        campaign_id: campId,
        campaign_name: r.campaign_name ?? "(campaign)",
        campaign_status: campMeta[campId]?.status ?? "",
        adset_id: String(r.adset_id ?? ""),
        adset_name: r.adset_name ?? "",
        ad_id: adId,
        ad_name: r.ad_name ?? "(ad)",
        impressions: num(r.impressions),
        clicks: num(r.clicks),
        spend: num(r.spend),
        ctr: num(r.ctr),
        cpc: num(r.cpc),
        frequency: num(r.frequency),
        meta_leads: metaLeads(r.actions as { action_type?: string; value?: string }[] | undefined),
        crm_leads: c?.leads ?? 0,
        crm_qualified: c?.qualified ?? 0,
        crm_booked: c?.booked ?? 0,
        // The "why" behind the grade. Absent when an ad produced no CRM leads.
        crm_never_called: c?.never_called ?? 0,
        crm_tried_not_reached: c?.tried_not_reached ?? 0,
        crm_spoke: c?.spoke ?? 0,
        crm_not_interested: c?.not_interested ?? 0,
        crm_wrong_or_dnc: c?.wrong_or_dnc ?? 0,
        crm_still_open: c?.still_open ?? 0,
        crm_first_call_mins: c?.median_first_call_mins ?? 0,
      };
    });

    return json({ ok: true, currency, preset, ad_account_id: `act_${acct}`, rows });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
