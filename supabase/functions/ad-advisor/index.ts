// AI Ad Advisor — the super-admin's Meta-ads performance brain.
//
// It does NOT re-fetch anything: the browser already loaded campaign rows from
// ads-insights, and passes them here. This function computes the standard Meta
// metrics (CTR, CPC, CPM, CPL, CPA, and ROAS when booking value is available),
// then asks the LLM for concrete, prioritised moves across the funnel —
// awareness → retargeting → conversion — with Andromeda-aware creative/targeting
// guidance to lift CTR and lower CPC/CPM/CPA. Grounded in the SAME match_knowledge
// brain (global guidebook) the coach/assistant use — no parallel store.
//
// Auth: platform super-admin only (the central ad business spans all companies).
// Body: { rows: AdRow[], currency?: string, company_id?: string }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GROQ = Deno.env.get("GROQ_API_KEY") ?? "";

// deno-lint-ignore no-explicit-any
const embedModel = new (Supabase as any).ai.Session("gte-small");

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

interface AdRow {
  campaign_id: string; campaign_name: string; campaign_status: string;
  impressions: number; clicks: number; spend: number;
  meta_leads: number; crm_leads: number; crm_qualified: number; crm_booked: number;
  booking_value?: number;
}

const n = (x: unknown) => (Number.isFinite(Number(x)) ? Number(x) : 0);
const div = (a: number, b: number) => (b > 0 ? a / b : 0);

/** Roll ad-level rows up to campaigns and compute the standard metrics. */
function byCampaign(rows: AdRow[]) {
  const m = new Map<string, AdRow>();
  for (const r of rows) {
    const k = r.campaign_id || r.campaign_name || "unknown";
    const a = m.get(k) ?? {
      campaign_id: k, campaign_name: r.campaign_name || k, campaign_status: r.campaign_status || "",
      impressions: 0, clicks: 0, spend: 0, meta_leads: 0, crm_leads: 0, crm_qualified: 0, crm_booked: 0, booking_value: 0,
    };
    a.impressions += n(r.impressions); a.clicks += n(r.clicks); a.spend += n(r.spend);
    a.meta_leads += n(r.meta_leads); a.crm_leads += n(r.crm_leads);
    a.crm_qualified += n(r.crm_qualified); a.crm_booked += n(r.crm_booked);
    a.booking_value = n(a.booking_value) + n(r.booking_value);
    m.set(k, a);
  }
  return [...m.values()].map((c) => ({
    id: c.campaign_id, name: c.campaign_name, status: c.campaign_status,
    spend: Math.round(c.spend), impressions: c.impressions, clicks: c.clicks,
    ctr_pct: +(div(c.clicks, c.impressions) * 100).toFixed(2),
    cpc: +div(c.spend, c.clicks).toFixed(2),
    cpm: +div(c.spend, c.impressions / 1000).toFixed(2),
    leads: c.crm_leads || c.meta_leads,
    cpl: +div(c.spend, c.crm_leads || c.meta_leads).toFixed(0),
    qualified: c.crm_qualified, booked: c.crm_booked,
    cpa_booked: c.crm_booked ? +div(c.spend, c.crm_booked).toFixed(0) : null,
    lead_to_qualified_pct: +(div(c.crm_qualified, c.crm_leads || c.meta_leads) * 100).toFixed(1),
    qualified_to_booked_pct: +(div(c.crm_booked, c.crm_qualified) * 100).toFixed(1),
    roas: n(c.booking_value) > 0 && c.spend > 0 ? +div(n(c.booking_value), c.spend).toFixed(2) : null,
  })).sort((a, b) => b.spend - a.spend);
}

async function facts(admin: ReturnType<typeof createClient>, companyId: string | null): Promise<string[]> {
  if (!companyId) return [];
  try {
    const embedding = await embedModel.run(
      "facebook meta ads targeting creative CTR CPC funnel awareness retargeting conversion real estate",
      { mean_pool: true, normalize: true },
    );
    const { data } = await admin.rpc("match_knowledge", {
      p_company: companyId, p_embedding: embedding, p_match_count: 4, p_min_similarity: 0.24,
    });
    return ((data ?? []) as Array<{ content: string }>).map((k) => String(k.content).slice(0, 300));
  } catch {
    return [];
  }
}

const SYSTEM =
  "You are a senior Meta (Facebook/Instagram) performance-marketing strategist advising the owner of a real-estate " +
  "lead-gen ad account. You are given real campaign metrics (spend, impressions, clicks, CTR, CPC, CPM, cost-per-lead, " +
  "cost-per-booking, CRM lead→qualified→booked rates, and ROAS where known). Analyse them and give SPECIFIC, prioritised " +
  "moves — never generic theory. Think across the FULL funnel: AWARENESS (reach/CTR/CPM, hook & creative), RETARGETING " +
  "(warm audiences, engagers, lead-form openers, site visitors), and CONVERSION (CPA, lead quality, booking rate). " +
  "Optimise for Meta's Andromeda ranking: it rewards CREATIVE VOLUME + DIVERSITY and BROAD targeting (Advantage+ / broad + " +
  "strong creative) over hyper-narrow audiences, and it leans on early engagement signals — so advise creative testing and " +
  "letting the system find audiences rather than over-restricting. Concretely help LOWER CPC/CPM/CPA and RAISE CTR & ROAS: " +
  "call out which campaigns to scale, cut, or restructure, and what to change (audience, creative, placement, budget, offer). " +
  'Reply ONLY as JSON: {"headline": string, "funnel": {"awareness": string, "retargeting": string, "conversion": string}, ' +
  '"alerts": [{"severity": "high"|"medium", "text": string}], ' +
  '"actions": [{"priority": "high"|"medium"|"low", "title": string, "why": string, "how": string, "metric": string, "source": string}], ' +
  '"watch": [string]}. headline = one blunt sentence on the account\'s biggest lever. Each funnel value = 1-2 sentences on ' +
  "that stage's health + the fix. " +
  "alerts = anomalies worth flagging NOW from the data (e.g. a campaign with high spend but 0 bookings, CTR under ~0.8%, or " +
  "CPA far above the account average) — name the campaign and the number; [] if none. " +
  "actions: 4-7, most impactful first. Each action is a DECISION with its evidence — 'title' is the imperative move naming the " +
  "campaign (e.g. \"Pause 'Noida Plots – Broad'\"); 'why' states the reason WITH the actual numbers (e.g. 'CTR 0.8%, CPA rupees 4,200 " +
  "vs account rupees 1,900'); 'how' is the concrete step; 'metric' is the KPI it moves (CTR/CPC/CPM/CPA/ROAS); 'source' names where " +
  "the evidence came from (e.g. 'Campaign insights, selected date range' or 'CRM lead→booked'). Every action MUST read as " +
  "ACTION + REASON(with numbers) + DATA SOURCE. 'watch' = 2-3 short KPI targets to monitor. Plain English, confident, practical. " +
  "NEVER invent numbers not in the data; if a figure is unknown (e.g. ROAS without booking value), say so instead of guessing.\n\n" +
  "CRITICAL — AD PROBLEM vs FOLLOW-UP PROBLEM. Every campaign carries a `followup` block (how many of its leads the sales team " +
  "actually called, how fast) and a `verdict`. A campaign with no bookings has NOT necessarily failed: if its leads were never " +
  "called, the ads worked and the TEAM did not. Obey the verdict:\n" +
  "• verdict 'followup_problem' → NEVER advise pausing, cutting or reducing budget on that campaign. Say plainly that the ads are " +
  "delivering but the leads aren't being worked, quote the never-called % and median response time, and make the action an " +
  "OPERATIONAL fix (call the untouched leads today, set a 30-minute first-call SLA, reassign or add a rep, turn on alerts). " +
  "Flag it in alerts as wasted spend caused by follow-up, not by the ad.\n" +
  "• verdict 'ad_problem' → the leads WERE worked properly and still didn't convert, so the ad/targeting/offer is genuinely at " +
  "fault; pausing, restructuring or refreshing creative is fair.\n" +
  "• verdict 'working' → protect and scale it.\n" +
  "• verdict 'unknown' → too few leads to judge; advise gathering more data, not cutting.";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!GROQ) return json({ ok: false, error: "AI is not configured." }, 200);

  const auth = req.headers.get("Authorization") ?? "";
  const u = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
  const { data: ud } = await u.auth.getUser();
  if (!ud?.user) return json({ ok: false, error: "Unauthorized" }, 401);
  const { data: pa } = await u.from("platform_admins").select("user_id").eq("user_id", ud.user.id).maybeSingle();
  if (!pa) return json({ ok: false, error: "Super-admin only." }, 403);

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const rows = Array.isArray(body.rows) ? (body.rows as AdRow[]) : [];
  if (rows.length === 0) return json({ ok: false, error: "No campaign data to analyse — load your ads first." }, 200);
  const currency = typeof body.currency === "string" ? body.currency : "";
  const range = typeof body.range === "string" ? body.range : "";

  const campaigns = byCampaign(rows);
  const t = campaigns.reduce(
    (s, c) => {
      s.spend += c.spend; s.impressions += c.impressions; s.clicks += c.clicks;
      s.leads += c.leads; s.qualified += c.qualified; s.booked += c.booked;
      return s;
    },
    { spend: 0, impressions: 0, clicks: 0, leads: 0, qualified: 0, booked: 0 },
  );
  const totals = {
    spend: Math.round(t.spend), impressions: t.impressions, clicks: t.clicks,
    ctr_pct: +(div(t.clicks, t.impressions) * 100).toFixed(2),
    cpc: +div(t.spend, t.clicks).toFixed(2),
    cpm: +div(t.spend, t.impressions / 1000).toFixed(2),
    leads: t.leads, cpl: +div(t.spend, t.leads).toFixed(0),
    qualified: t.qualified, booked: t.booked,
    cpa_booked: t.booked ? +div(t.spend, t.booked).toFixed(0) : null,
  };

  // ---- Was it the AD, or the FOLLOW-UP? ----
  // A campaign judged only on bookings gets blamed for a team that never called
  // its leads. Pull each campaign's follow-up health and label it, so the advice
  // fixes the real cause instead of pausing a working ad.
  interface Health { campaign_id: string; leads: number; never_called: number; called_in_30m: number; median_minutes: number | null; advanced: number }
  const { data: healthRows } = await u.rpc("campaign_lead_health", { p_days: 30 });
  const health = new Map<string, Health>(
    ((healthRows ?? []) as Health[]).map((h) => [String(h.campaign_id), h]),
  );

  const diagnosed = campaigns.map((c) => {
    const h = health.get(String(c.id));
    if (!h || h.leads < 3) {
      return { ...c, followup: h ?? null, verdict: "unknown", verdict_label: "Not enough leads to judge" };
    }
    const neverPct = Math.round((h.never_called / h.leads) * 100);
    const fastPct = Math.round((h.called_in_30m / h.leads) * 100);
    const advPct = Math.round((h.advanced / h.leads) * 100);
    const followupBad = neverPct >= 40 || (h.median_minutes != null && h.median_minutes > 240);
    const verdict = followupBad ? "followup_problem" : advPct >= 10 ? "working" : "ad_problem";
    const verdict_label = followupBad
      ? `Follow-up problem — ${neverPct}% of its leads were never called`
      : verdict === "working"
        ? `Working — ${advPct}% of leads advanced`
        : `Ad problem — leads were worked (${fastPct}% within 30 min) but don't convert`;
    return {
      ...c,
      followup: { leads: h.leads, never_called: h.never_called, never_pct: neverPct, called_in_30m_pct: fastPct, median_minutes: h.median_minutes, advanced: h.advanced },
      verdict, verdict_label,
    };
  });

  const admin = createClient(SUPABASE_URL, SERVICE);
  const companyId = typeof body.company_id === "string" ? body.company_id : null;
  const brain = await facts(admin, companyId);

  const userMsg =
    `Currency: ${currency || "?"}${range ? ` | Date range: ${range}` : ""}\nAccount totals: ${JSON.stringify(totals)}\n` +
    `Campaigns (top by spend). Each carries "followup" (how its leads were actually worked by the sales team) and a "verdict":\n${JSON.stringify(diagnosed.slice(0, 12))}` +
    (brain.length ? `\n\nOur playbook facts (use if relevant):\n${brain.map((f) => `- ${f}`).join("\n")}` : "");

  let out: Record<string, unknown> | null = null;
  try {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${GROQ}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile", temperature: 0.4, response_format: { type: "json_object" },
        messages: [{ role: "system", content: SYSTEM }, { role: "user", content: userMsg }],
      }),
    });
    out = JSON.parse((await r.json()).choices?.[0]?.message?.content ?? "{}");
  } catch (_e) {
    out = null;
  }
  if (!out) return json({ ok: false, error: "Couldn't analyse right now — try again." }, 200);

  return json({ ok: true, totals, campaigns: diagnosed, advice: out });
});
