"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Row = {
  campaign_id: string; campaign_name: string; campaign_status: string;
  adset_id: string; adset_name: string;
  ad_id: string; ad_name: string;
  impressions: number; clicks: number; spend: number; ctr: number; cpc: number; frequency?: number;
  meta_leads: number; crm_leads: number; crm_qualified: number; crm_booked: number;
  // The autopsy behind the grade — what actually happened to this ad's leads.
  crm_never_called?: number; crm_tried_not_reached?: number; crm_spoke?: number;
  crm_not_interested?: number; crm_wrong_or_dnc?: number; crm_still_open?: number;
  crm_first_call_mins?: number;
};

/**
 * The grade ladder, written once.
 *
 * leadQuality() reads it to award the letter and gapToGrade() reads it to say
 * what the next letter costs, so the page can never tell you you're a C and
 * then quote a target that wouldn't actually make you a B.
 *
 * Walked top-down; D's thresholds are zero so something always matches.
 */
const GRADES: { grade: string; tone: string; qr: number; br: number }[] = [
  { grade: "A", tone: "#22c55e", qr: 0.40, br: 0.03 },
  { grade: "B", tone: "#84cc16", qr: 0.25, br: Infinity },
  { grade: "C", tone: "#f59e0b", qr: 0.10, br: Infinity },
  { grade: "D", tone: "#ef4444", qr: 0, br: Infinity },
];

/** Lead quality from CRM outcomes — the thing Meta can't see. 0-100 + a grade. */
function leadQuality(leads: number, qualified: number, booked: number): { score: number; grade: string; tone: string } | null {
  if (!leads) return null;
  const qr = qualified / leads, br = booked / leads;
  const score = Math.max(0, Math.min(100, Math.round(qr * 100 + br * 300)));
  const g = GRADES.find((x) => qr >= x.qr || br >= x.br) ?? GRADES[GRADES.length - 1];
  return { score, grade: g.grade, tone: g.tone };
}

/**
 * How many more of these same leads had to reach Interested for the next grade
 * up. "D" on its own is a verdict you can't act on; "four more of these 68 and
 * it's a C" is a target.
 */
function gapToGrade(leads: number, qualified: number, booked: number): { grade: string; tone: string; need: number } | null {
  const now = leadQuality(leads, qualified, booked);
  if (!now) return null;
  const i = GRADES.findIndex((g) => g.grade === now.grade);
  if (i <= 0) return null; // already an A — nothing above it.
  const next = GRADES[i - 1];
  return { grade: next.grade, tone: next.tone, need: Math.max(1, Math.ceil(next.qr * leads) - qualified) };
}

/**
 * What happened to an ad's leads. never/missed/spoke are mutually exclusive and
 * add up to leads exactly, because they come from one question asked in order:
 * was it dialled, did it connect for 30s.
 */
type Autopsy = {
  leads: number; never: number; missed: number; spoke: number;
  qualified: number; booked: number; no: number; junk: number; open: number; mins: number;
};

function autopsyOf(r: {
  crm_leads: number; crm_qualified: number; crm_booked: number;
  crm_never_called?: number; crm_tried_not_reached?: number; crm_spoke?: number;
  crm_not_interested?: number; crm_wrong_or_dnc?: number; crm_still_open?: number;
  crm_first_call_mins?: number;
}): Autopsy {
  return {
    leads: r.crm_leads, never: r.crm_never_called ?? 0, missed: r.crm_tried_not_reached ?? 0,
    spoke: r.crm_spoke ?? 0, qualified: r.crm_qualified, booked: r.crm_booked,
    no: r.crm_not_interested ?? 0, junk: r.crm_wrong_or_dnc ?? 0, open: r.crm_still_open ?? 0,
    mins: r.crm_first_call_mins ?? 0,
  };
}

function fmtMins(m: number): string {
  if (!m) return "—";
  if (m < 60) return `${m} min`;
  const h = m / 60;
  if (h < 24) return `${h < 10 ? h.toFixed(1) : Math.round(h)} hr`;
  return `${Math.round(h / 24)} days`;
}

/**
 * The one move that would lift this ad's grade the most, in priority order.
 *
 * The order is deliberate: everything above "the ad is bringing the wrong
 * people" is something WE did, and each one drags the grade down while looking
 * exactly like a bad ad. Pausing an ad because nobody called its leads is the
 * expensive mistake this is here to prevent.
 */
function nextMove(a: Autopsy): { tone: string; icon: string; title: string; detail: string } | null {
  if (!a.leads) return null;
  const pct = (n: number) => Math.round((n / a.leads) * 100);

  if (a.never >= 3 && a.never / a.leads >= 0.15) {
    return { tone: "#ef4444", icon: "📞", title: `${a.never} leads were never called at all`,
      detail: `That is ${pct(a.never)}% of what this ad already paid for, sitting untouched. Assign and dial them before you judge the ad — until they are called, this grade is measuring the team, not the ad. This is the cheapest lift on the page: the money is already spent.` };
  }
  if (a.mins >= 60) {
    return { tone: "#f59e0b", icon: "⏱", title: `First call goes out after ${fmtMins(a.mins)}`,
      detail: `A Meta lead is warm for minutes, not hours. Half of these were rung ${fmtMins(a.mins)} after they filled the form, so a lot of the "not interested" below is really "too late". Get the first dial under 30 minutes and the same ad, unchanged, will grade higher.` };
  }
  if (a.junk / a.leads >= 0.15) {
    return { tone: "#f59e0b", icon: "🧹", title: `${pct(a.junk)}% wrong numbers or do-not-call`,
      detail: `The form is collecting junk taps. Switch the lead form to the higher-intent version, turn on phone confirmation, or add one qualifying question (budget or location) so the casual taps drop out before you pay for them.` };
  }
  if (a.missed / a.leads >= 0.4) {
    return { tone: "#f59e0b", icon: "📵", title: `${pct(a.missed)}% picked up nobody`,
      detail: `They were dialled but never connected. Either the numbers are poor or the calling hour is wrong. Try this ad's leads inside the first hour and again in the 7-9pm slot before spending more on it.` };
  }
  if (a.spoke >= 5 && a.no / a.spoke >= 0.6) {
    return { tone: "#ef4444", icon: "🎯", title: `${a.no} of the ${a.spoke} who answered said no`,
      detail: `They picked up, so the numbers are real and the follow-up happened — this one is genuinely the ad. It is reaching the wrong audience, or promising something the project doesn't deliver. Change the targeting or the creative; more calls will not fix it.` };
  }
  if (a.open >= 5 && a.open / a.leads >= 0.4) {
    return { tone: "#f59e0b", icon: "🔁", title: `${a.open} leads are still sitting open`,
      detail: `Not lost and not won — no decision yet. This ad's real grade is not knowable until they close, so give them their follow-up calls before deciding to pause or scale it.` };
  }
  if (a.booked > 0 || a.qualified / a.leads >= 0.25) {
    return { tone: "#22c55e", icon: "🚀", title: `This ad is working — put more budget behind it`,
      detail: `${a.qualified} of ${a.leads} reached Interested or better${a.booked ? ` and ${a.booked} booked` : ""}, with the leads properly worked. This is the one to scale, and the one to copy the creative and audience from.` };
  }
  return { tone: "#f59e0b", icon: "🔬", title: `Worked properly, but few turned into anything`,
      detail: `The leads were called and reached, so follow-up isn't the gap. Test a different audience or a sharper creative on this one before adding budget.` };
}

/** Creative fatigue: seen too often, clicks drying up. */
function fatigue(frequency: number | undefined, ctr: number): { level: string; tone: string } | null {
  const f = frequency ?? 0;
  if (f >= 4 && ctr < 1.0) return { level: "High", tone: "#ef4444" };
  if (f >= 3 && ctr < 1.2) return { level: "Rising", tone: "#f59e0b" };
  return null;
}

const PRESETS: { key: string; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "last_7d", label: "Last 7 days" },
  { key: "last_30d", label: "Last 30 days" },
  { key: "this_month", label: "This month" },
];

function money(sym: string, n: number): string {
  return `${sym}${n.toLocaleString("en-IN", { maximumFractionDigits: n >= 100 ? 0 : 2 })}`;
}
function symbolOf(cur: string): string {
  return cur === "INR" ? "₹" : cur === "USD" ? "$" : cur === "EUR" ? "€" : cur === "GBP" ? "£" : (cur ? cur + " " : "");
}

type Agg = {
  campaign_id: string; campaign_name: string; campaign_status: string;
  impressions: number; clicks: number; spend: number;
  meta_leads: number; crm_leads: number; crm_qualified: number; crm_booked: number;
  crm_never_called: number; crm_tried_not_reached: number; crm_spoke: number;
  crm_not_interested: number; crm_wrong_or_dnc: number; crm_still_open: number;
  crm_first_call_mins: number;
  ads: Row[];
};

function rollUp(rows: Row[]): Agg[] {
  const by = new Map<string, Agg>();
  // Medians don't add up, so the campaign's first-call time is the ads' medians
  // weighted by how many leads each contributed — the typical lead's wait, which
  // is what a decision about the campaign actually turns on.
  const wait = new Map<string, { mins: number; leads: number }>();
  for (const r of rows) {
    const a = by.get(r.campaign_id) ?? {
      campaign_id: r.campaign_id, campaign_name: r.campaign_name, campaign_status: r.campaign_status,
      impressions: 0, clicks: 0, spend: 0, meta_leads: 0, crm_leads: 0, crm_qualified: 0, crm_booked: 0,
      crm_never_called: 0, crm_tried_not_reached: 0, crm_spoke: 0,
      crm_not_interested: 0, crm_wrong_or_dnc: 0, crm_still_open: 0, crm_first_call_mins: 0, ads: [],
    };
    a.impressions += r.impressions; a.clicks += r.clicks; a.spend += r.spend;
    a.meta_leads += r.meta_leads; a.crm_leads += r.crm_leads; a.crm_qualified += r.crm_qualified; a.crm_booked += r.crm_booked;
    a.crm_never_called += r.crm_never_called ?? 0;
    a.crm_tried_not_reached += r.crm_tried_not_reached ?? 0;
    a.crm_spoke += r.crm_spoke ?? 0;
    a.crm_not_interested += r.crm_not_interested ?? 0;
    a.crm_wrong_or_dnc += r.crm_wrong_or_dnc ?? 0;
    a.crm_still_open += r.crm_still_open ?? 0;
    if (r.crm_first_call_mins && r.crm_leads) {
      const w = wait.get(r.campaign_id) ?? { mins: 0, leads: 0 };
      w.mins += r.crm_first_call_mins * r.crm_leads; w.leads += r.crm_leads;
      wait.set(r.campaign_id, w);
    }
    a.ads.push(r);
    by.set(r.campaign_id, a);
  }
  for (const [id, w] of wait) {
    const a = by.get(id);
    if (a && w.leads) a.crm_first_call_mins = Math.round(w.mins / w.leads);
  }
  return Array.from(by.values()).sort((x, y) => y.spend - x.spend);
}

/**
 * Meta answers an expired token with a paragraph of API English ("Error
 * validating access token: Session has expired on Saturday, 25-Jul-26 23:00:00
 * PDT…"). An owner reading that on their phone has no idea a token needs
 * replacing. Pull the expiry date out so the page can say it plainly; null means
 * this isn't a token problem and the raw message should stand.
 */
function expiredOn(msg: string): string | null {
  if (!/access token|OAuthException|expired/i.test(msg)) return null;
  const m = msg.match(/expired on\s+(?:\w+,\s*)?([0-9]{1,2}-\w{3}-[0-9]{2,4})/i);
  return m ? m[1] : "kuch din pehle";
}

export function AdsManager({ companyId, configured, savedAccount }: { companyId: string; configured: boolean; savedAccount: string | null }) {
  const supabase = createClient();
  const [setupOpen, setSetupOpen] = useState(!configured);
  const [acctId, setAcctId] = useState(savedAccount ?? "");
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [isConfigured, setIsConfigured] = useState(configured);

  const [preset, setPreset] = useState("last_30d");
  const [rows, setRows] = useState<Row[]>([]);
  const [currency, setCurrency] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);

  // AI Ad Advisor — analyses the already-loaded rows (no extra Meta fetch).
  type Advice = {
    headline?: string;
    funnel?: { awareness?: string; retargeting?: string; conversion?: string };
    alerts?: { severity?: string; text?: string }[];
    actions?: { priority?: string; title?: string; why?: string; how?: string; metric?: string; source?: string }[];
    watch?: string[];
  };
  // Per-campaign verdict from the advisor: is a weak campaign an AD problem, or
  // did nobody call its leads? Shown as a badge so the owner never pauses a
  // working ad because of an internal follow-up failure.
  type Diag = { verdict?: string; verdict_label?: string; followup?: { never_pct?: number; called_in_30m_pct?: number; median_minutes?: number | null } | null };
  const [diag, setDiag] = useState<Record<string, Diag>>({});
  const [advice, setAdvice] = useState<Advice | null>(null);
  const [advising, setAdvising] = useState(false);
  const [advErr, setAdvErr] = useState<string | null>(null);

  // Custom date range.
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  // Previous-period benchmark totals (same-length window immediately before).
  const [prevTotals, setPrevTotals] = useState<{ spend: number; leads: number; qualified: number; booked: number } | null>(null);
  // Breakdown ("what's working") — Meta-only metrics by dimension.
  type BdRow = { key: string; impressions: number; clicks: number; spend: number; ctr: number; cpc: number };
  const [bdKind, setBdKind] = useState<string>("");
  const [bdRows, setBdRows] = useState<BdRow[]>([]);
  const [bdLoading, setBdLoading] = useState(false);

  const sym = symbolOf(currency);

  // The [since, until] (YYYY-MM-DD) for the current selection, and the same-length
  // window immediately before it (for the benchmark).
  function ymd(d: Date): string { return d.toISOString().slice(0, 10); }
  function currentRange(): { since: string; until: string } | null {
    if (preset === "custom") return customFrom && customTo ? { since: customFrom, until: customTo } : null;
    const today = new Date(); const u = ymd(today);
    if (preset === "today") return { since: u, until: u };
    if (preset === "last_7d") return { since: ymd(new Date(Date.now() - 6 * 864e5)), until: u };
    if (preset === "last_30d") return { since: ymd(new Date(Date.now() - 29 * 864e5)), until: u };
    if (preset === "this_month") { const d = new Date(today.getFullYear(), today.getMonth(), 1); return { since: ymd(d), until: u }; }
    return null;
  }
  function previousRange(cur: { since: string; until: string }): { since: string; until: string } {
    const s = Date.parse(cur.since), e = Date.parse(cur.until);
    const lenDays = Math.round((e - s) / 864e5) + 1;
    const prevUntil = new Date(s - 864e5);
    const prevSince = new Date(prevUntil.getTime() - (lenDays - 1) * 864e5);
    return { since: ymd(prevSince), until: ymd(prevUntil) };
  }
  /** % change vs the previous period, with whether that direction is good. */
  function deltaFor(cur: number, prev: number | undefined, upGood: boolean): { pct: number; good: boolean } | null {
    if (prev == null || prev <= 0) return null;
    const pct = Math.round(((cur - prev) / prev) * 100);
    return { pct, good: upGood ? pct >= 0 : pct <= 0 };
  }

  const load = useCallback(async () => {
    const cur = currentRange();
    if (preset === "custom" && !cur) { setError("Pick both a start and end date."); return; }
    setLoading(true); setError(null); setPrevTotals(null); setBdRows([]); setBdKind("");
    const body = preset === "custom" && cur
      ? { company: companyId, time_range: { since: cur.since, until: cur.until } }
      : { company: companyId, date_preset: preset };
    const { data, error } = await supabase.functions.invoke<{ ok: boolean; error?: string; currency?: string; rows?: Row[] }>("ads-insights", { body });
    setLoading(false); setLoaded(true);
    if (error || !data?.ok) { setError(data?.error || error?.message || "Couldn't load ads data."); setRows([]); return; }
    setCurrency(data.currency ?? "");
    setRows(data.rows ?? []);
    // Benchmark: pull the same-length window immediately before, quietly.
    if (cur) {
      const prev = previousRange(cur);
      const { data: pd } = await supabase.functions.invoke<{ ok: boolean; rows?: Row[] }>("ads-insights", { body: { company: companyId, time_range: prev } });
      if (pd?.ok && Array.isArray(pd.rows)) {
        const pt = pd.rows.reduce((t, r) => ({ spend: t.spend + r.spend, leads: t.leads + r.crm_leads, qualified: t.qualified + r.crm_qualified, booked: t.booked + r.crm_booked }), { spend: 0, leads: 0, qualified: 0, booked: 0 });
        setPrevTotals(pt);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, companyId, preset, customFrom, customTo]);

  useEffect(() => {
    if (isConfigured && (preset !== "custom" || (customFrom && customTo))) void load();
  }, [isConfigured, preset, customFrom, customTo, load]);

  async function loadBreakdown(kind: string) {
    setBdKind(kind); setBdLoading(true); setBdRows([]);
    const cur = currentRange();
    const body = cur ? { company: companyId, breakdown: kind, time_range: cur } : { company: companyId, breakdown: kind, date_preset: preset };
    const { data } = await supabase.functions.invoke<{ ok: boolean; rows?: BdRow[] }>("ads-insights", { body });
    setBdLoading(false);
    if (data?.ok && Array.isArray(data.rows)) setBdRows(data.rows);
  }
  // Clear stale advice whenever the underlying numbers change.
  useEffect(() => { setAdvice(null); setAdvErr(null); setDiag({}); }, [rows, preset]);

  async function runAdvisor() {
    if (rows.length === 0) { setAdvErr("Load your ads first, then ask the advisor."); return; }
    setAdvising(true); setAdvErr(null);
    const rangeLabel = PRESETS.find((p) => p.key === preset)?.label ?? preset;
    const { data, error } = await supabase.functions.invoke<{ ok: boolean; error?: string; advice?: Advice; campaigns?: ({ id?: string } & Diag)[] }>(
      "ad-advisor",
      { body: { rows, currency, company_id: companyId, range: rangeLabel } },
    );
    setAdvising(false);
    if (error || !data?.ok || !data.advice) { setAdvErr(data?.error || error?.message || "Couldn't analyse right now."); return; }
    setAdvice(data.advice);
    const map: Record<string, Diag> = {};
    for (const c of data.campaigns ?? []) if (c.id) map[String(c.id)] = { verdict: c.verdict, verdict_label: c.verdict_label, followup: c.followup };
    setDiag(map);
  }

  /** Plain-text summary of the advice for copy / WhatsApp / a note. */
  function adviceText(): string {
    if (!advice) return "";
    const rangeLabel = PRESETS.find((p) => p.key === preset)?.label ?? preset;
    const L: string[] = [`AI Ad Advisor — ${rangeLabel}`];
    if (advice.headline) L.push("", advice.headline);
    if (advice.alerts?.length) {
      L.push("", "⚠ Alerts:");
      advice.alerts.forEach((a) => L.push(`- ${a.text}`));
    }
    if (advice.actions?.length) {
      L.push("", "Do this next:");
      advice.actions.forEach((a, i) => {
        L.push(`${i + 1}. ${a.title}${a.metric ? ` (${a.metric})` : ""}`);
        if (a.why) L.push(`   Why: ${a.why}`);
        if (a.how) L.push(`   How: ${a.how}`);
        if (a.source) L.push(`   Source: ${a.source}`);
      });
    }
    if (advice.watch?.length) L.push("", `Watch: ${advice.watch.join(" · ")}`);
    return L.join("\n");
  }
  function copyAdvice() {
    void navigator.clipboard.writeText(adviceText());
    setAdvErr(null);
  }
  function shareWhatsApp() {
    window.open(`https://wa.me/?text=${encodeURIComponent(adviceText())}`, "_blank");
  }

  async function save() {
    if (!acctId.trim()) { setSaveMsg("Enter your Ad Account ID."); return; }
    setSaving(true); setSaveMsg(null);
    const { error } = await supabase.rpc("set_facebook_ads", {
      p_company: companyId, p_ad_account_id: acctId.trim(), p_token: token.trim() || null,
    });
    setSaving(false);
    if (error) { setSaveMsg("Couldn't save: " + error.message); return; }
    setToken(""); setSaveMsg("Saved ✓"); setIsConfigured(true); setSetupOpen(false);
    void load();
  }

  const aggs = rollUp(rows);
  const totals = aggs.reduce((t, a) => ({
    spend: t.spend + a.spend, leads: t.leads + a.crm_leads, qualified: t.qualified + a.crm_qualified, booked: t.booked + a.crm_booked,
    never: t.never + a.crm_never_called,
  }), { spend: 0, leads: 0, qualified: 0, booked: 0, never: 0 });
  // Leads already bought and never dialled — the only number on this page that
  // costs nothing to fix, so it sits above everything else.
  const unworked = aggs
    .filter((a) => a.crm_never_called > 0)
    .sort((x, y) => y.crm_never_called - x.crm_never_called);

  const card: React.CSSProperties = { background: "rgba(255,255,255,0.015)", border: "1px solid var(--border)", borderRadius: 16, padding: 24 };
  const input: React.CSSProperties = { width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "rgba(255,255,255,0.02)", color: "var(--text)", outline: "none" };
  const th: React.CSSProperties = { textAlign: "right", padding: "8px 10px", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--muted)", whiteSpace: "nowrap" };
  const td: React.CSSProperties = { textAlign: "right", padding: "9px 10px", fontSize: 13, whiteSpace: "nowrap" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Setup */}
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h3 style={{ margin: "0 0 4px", color: "var(--accent)", fontSize: 15, letterSpacing: "1px", textTransform: "uppercase" }}>Central ad account</h3>
            <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>
              {isConfigured ? <>Connected: <b style={{ color: "var(--text)" }}>{savedAccount || acctId}</b></> : "Connect the central Meta ad account to see performance here."}
            </p>
          </div>
          <button type="button" onClick={() => setSetupOpen((s) => !s)}
            style={{ fontSize: 12, padding: "7px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "rgba(255,255,255,0.04)", color: "var(--muted)", cursor: "pointer" }}>
            {setupOpen ? "Hide" : isConfigured ? "Edit" : "Set up"}
          </button>
        </div>

        {setupOpen && (
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label style={{ display: "block", fontSize: 13, color: "var(--muted)", marginBottom: 6 }}>Ad Account ID</label>
              <input style={input} value={acctId} onChange={(e) => setAcctId(e.target.value)} placeholder="act_1234567890 (Ads Manager → account dropdown)" />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 13, color: "var(--muted)", marginBottom: 6 }}>
                Marketing API token {isConfigured && <span style={{ color: "#1877F2" }}>· saved 🔒</span>}
              </label>
              <input type="password" autoComplete="off" style={input} value={token} onChange={(e) => setToken(e.target.value)}
                placeholder={isConfigured ? "Stored securely — leave blank to keep current" : "A token with ads_read on this account"} />
              <p style={{ fontSize: 12, color: "var(--muted)", margin: "6px 2px 0" }}>
                Needs the <b>ads_read</b> permission. Graph API Explorer → your app → add <b>ads_read</b> → generate token.
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button type="button" onClick={save} disabled={saving}
                style={{ background: "linear-gradient(135deg, #1877F2, #0A52CC)", color: "#fff", padding: "10px 20px", borderRadius: 8, border: "none", fontWeight: 600, cursor: saving ? "wait" : "pointer" }}>
                {saving ? "Saving…" : "Save"}
              </button>
              {saveMsg && <span style={{ fontSize: 13, color: saveMsg.startsWith("Saved") ? "#22c55e" : "#f87171" }}>{saveMsg}</span>}
            </div>
          </div>
        )}
      </div>

      {isConfigured && (
        <>
          {/* Totals + date range */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[...PRESETS, { key: "custom", label: "Custom" }].map((p) => (
                <button key={p.key} onClick={() => setPreset(p.key)}
                  style={{ padding: "7px 14px", borderRadius: 999, cursor: "pointer", fontSize: 13,
                    border: `1px solid ${preset === p.key ? "var(--accent)" : "var(--border)"}`,
                    background: preset === p.key ? "var(--accent)" : "rgba(255,255,255,0.03)",
                    color: preset === p.key ? "#fff" : "var(--text)" }}>
                  {p.label}
                </button>
              ))}
              {preset === "custom" && (
                <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                  <input type="date" value={customFrom} max={customTo || undefined} onChange={(e) => setCustomFrom(e.target.value)}
                    style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "rgba(255,255,255,0.03)", color: "var(--text)", fontSize: 13 }} />
                  <span style={{ color: "var(--muted)", fontSize: 13 }}>→</span>
                  <input type="date" value={customTo} min={customFrom || undefined} onChange={(e) => setCustomTo(e.target.value)}
                    style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "rgba(255,255,255,0.03)", color: "var(--text)", fontSize: 13 }} />
                </span>
              )}
            </div>
            <button onClick={() => load()} disabled={loading}
              style={{ fontSize: 12, padding: "7px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "rgba(255,255,255,0.04)", color: "var(--muted)", cursor: "pointer" }}>
              {loading ? "Loading…" : "🔄 Refresh"}
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
            <Stat label="Spend" value={money(sym, totals.spend)} tone="#f59e0b" delta={deltaFor(totals.spend, prevTotals?.spend, false)} />
            <Stat label="Leads (CRM)" value={totals.leads.toLocaleString("en-IN")} tone="#1877F2" delta={deltaFor(totals.leads, prevTotals?.leads, true)} />
            <Stat label="Qualified" value={totals.qualified.toLocaleString("en-IN")} tone="#a855f7" delta={deltaFor(totals.qualified, prevTotals?.qualified, true)} />
            <Stat label="Booked" value={totals.booked.toLocaleString("en-IN")} tone="#22c55e" delta={deltaFor(totals.booked, prevTotals?.booked, true)} />
            <Stat label="Cost / Booked" value={totals.booked ? money(sym, totals.spend / totals.booked) : "—"} tone="#ef4444"
              delta={deltaFor(totals.booked ? totals.spend / totals.booked : 0, prevTotals && prevTotals.booked ? prevTotals.spend / prevTotals.booked : undefined, false)} />
            {(() => {
              const q = leadQuality(totals.leads, totals.qualified, totals.booked);
              const gap = gapToGrade(totals.leads, totals.qualified, totals.booked);
              return <Stat label="Lead Quality" value={q ? `${q.grade} · ${q.score}` : "—"} tone={q?.tone ?? "#86868B"}
                hint={gap ? `${gap.need} more qualified → ${gap.grade}` : q ? "Top grade — copy this everywhere" : undefined} />;
            })()}
          </div>
          {prevTotals && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: -6 }}>▲▼ = change vs the previous {preset === "custom" ? "period" : (PRESETS.find((p) => p.key === preset)?.label ?? "period").toLowerCase()}.</div>}

          {/* Leads you have already paid for and nobody rang.
              Every other fix on this page costs money or a new creative. This one
              costs a phone call, and it silently drags the grade of the ad that
              produced them — so it goes first, before the advisor and the table. */}
          {unworked.length > 0 && (
            <div style={{ ...card, background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.35)", padding: 18 }}>
              <strong style={{ color: "#fca5a5", fontSize: 15 }}>
                📞 {totals.never} lead{totals.never === 1 ? "" : "s"} you paid for were never called
              </strong>
              <p style={{ margin: "6px 0 0", fontSize: 13.5, color: "var(--text)", lineHeight: 1.6 }}>
                {Math.round((totals.never / Math.max(1, totals.leads)) * 100)}% of this period&apos;s leads never got a single dial.
                They still count against the ad&apos;s grade, so these campaigns are scoring worse than they really are —
                call them before pausing or judging anything here.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                {unworked.slice(0, 5).map((a) => (
                  <span key={a.campaign_id} style={{ fontSize: 12.5, background: "rgba(255,255,255,0.05)", border: "1px solid var(--border)", borderRadius: 999, padding: "4px 12px", color: "var(--text)" }}>
                    {a.campaign_name} · <b style={{ color: "#fca5a5" }}>{a.crm_never_called}</b> of {a.crm_leads}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* AI Ad Advisor — reads the loaded campaigns and advises across the funnel. */}
          <div style={{ ...card, background: "rgba(99,102,241,0.05)", border: "1px solid rgba(99,102,241,0.25)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div style={{ minWidth: 220, flex: 1 }}>
                <strong style={{ color: "#fff", fontSize: 15 }}>🧠 AI Ad Advisor</strong>
                <p className="subtitle" style={{ margin: "2px 0 0" }}>
                  Analyses your live campaigns — CTR, CPC, CPM, CPA, ROAS — and gives prioritised moves across
                  awareness → retargeting → conversion to lower cost and lift returns (Andromeda-aware).
                </p>
              </div>
              <button className="primary" onClick={runAdvisor} disabled={advising || rows.length === 0}>
                {advising ? "Analysing…" : advice ? "Re-analyse" : "Analyse my ads"}
              </button>
            </div>
            {advErr && <div style={{ marginTop: 10, color: "#f87171", fontSize: 13 }}>{advErr}</div>}

            {advice && (
              <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 14 }}>
                {Array.isArray(advice.alerts) && advice.alerts.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {advice.alerts.map((al, i) => {
                      const hi = al.severity === "high";
                      return (
                        <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "10px 12px", borderRadius: 10,
                          background: hi ? "rgba(239,68,68,0.1)" : "rgba(245,158,11,0.1)",
                          border: `1px solid ${hi ? "rgba(239,68,68,0.35)" : "rgba(245,158,11,0.35)"}` }}>
                          <span>{hi ? "🚨" : "⚠️"}</span>
                          <span style={{ fontSize: 13.5, color: hi ? "#fca5a5" : "#fcd34d" }}>{al.text}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
                {advice.headline && (
                  <div style={{ fontSize: 16, fontWeight: 600, color: "#fff", letterSpacing: "-0.01em" }}>
                    {advice.headline}
                  </div>
                )}
                {advice.funnel && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
                    {([
                      ["📣 Awareness", advice.funnel.awareness, "#f59e0b"],
                      ["🔁 Retargeting", advice.funnel.retargeting, "#a855f7"],
                      ["🎯 Conversion", advice.funnel.conversion, "#22c55e"],
                    ] as const).map(([label, text, tone]) =>
                      text ? (
                        <div key={label} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: tone, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>{label}</div>
                          <div style={{ fontSize: 13.5, color: "var(--text)", lineHeight: 1.5 }}>{text}</div>
                        </div>
                      ) : null,
                    )}
                  </div>
                )}
                {Array.isArray(advice.actions) && advice.actions.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Do this next</div>
                    {advice.actions.map((a, i) => {
                      const tone = a.priority === "high" ? "#ef4444" : a.priority === "medium" ? "#f59e0b" : "#86868B";
                      return (
                        <div key={i} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 14px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: tone, border: `1px solid ${tone}`, borderRadius: 999, padding: "1px 8px", textTransform: "uppercase" }}>{a.priority ?? "action"}</span>
                            <strong style={{ color: "#fff", fontSize: 14 }}>{a.title}</strong>
                            {a.metric && <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--muted)" }}>↳ {a.metric}</span>}
                          </div>
                          {a.why && <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 5 }}>{a.why}</div>}
                          {a.how && <div style={{ fontSize: 13.5, color: "var(--text)", marginTop: 5 }}>👉 {a.how}</div>}
                          {a.source && <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 5, opacity: 0.8 }}>📊 Source: {a.source}</div>}
                        </div>
                      );
                    })}
                  </div>
                )}
                {Array.isArray(advice.watch) && advice.watch.length > 0 && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>Watch:</span>
                    {advice.watch.map((w, i) => (
                      <span key={i} style={{ fontSize: 12, background: "rgba(255,255,255,0.05)", border: "1px solid var(--border)", borderRadius: 999, padding: "3px 10px", color: "var(--text)" }}>{w}</span>
                    ))}
                  </div>
                )}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 2 }}>
                  <button className="link" onClick={copyAdvice}>📋 Copy plan</button>
                  <button className="link" onClick={shareWhatsApp}>💬 WhatsApp</button>
                </div>
              </div>
            )}
          </div>

          {/* Breakdowns — what's actually working, by dimension. */}
          {!error && (
            <div style={card}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
                <strong style={{ color: "#fff", fontSize: 15 }}>🔍 What&apos;s working</strong>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>Compare by:</span>
                {[
                  ["placement", "Placement"], ["audience", "Audience"], ["region", "Region"],
                  ["device", "Device"], ["adset", "Ad set"], ["creative", "Creative"],
                ].map(([k, lbl]) => (
                  <button key={k} onClick={() => loadBreakdown(k)}
                    style={{ padding: "6px 12px", borderRadius: 999, cursor: "pointer", fontSize: 12.5,
                      border: `1px solid ${bdKind === k ? "var(--accent)" : "var(--border)"}`,
                      background: bdKind === k ? "var(--accent)" : "rgba(255,255,255,0.03)",
                      color: bdKind === k ? "#fff" : "var(--text)" }}>{lbl}</button>
                ))}
              </div>
              {!bdKind ? (
                <div style={{ fontSize: 13, color: "var(--muted)" }}>Pick a dimension to see which placements, audiences or creatives get the best CTR and cheapest clicks.</div>
              ) : bdLoading ? (
                <div style={{ fontSize: 13, color: "var(--muted)" }}>Loading…</div>
              ) : bdRows.length === 0 ? (
                <div style={{ fontSize: 13, color: "var(--muted)" }}>No breakdown data for this range.</div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border)" }}>
                        <th style={{ ...th, textAlign: "left" }}>{bdKind}</th>
                        <th style={th}>Impr.</th><th style={th}>Clicks</th><th style={th}>CTR</th><th style={th}>CPC</th><th style={th}>Spend</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bdRows.slice(0, 20).map((r, i) => (
                        <tr key={i} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                          <td style={{ ...td, textAlign: "left", color: "#fff" }}>{r.key}</td>
                          <td style={td}>{r.impressions.toLocaleString("en-IN")}</td>
                          <td style={td}>{r.clicks.toLocaleString("en-IN")}</td>
                          <td style={{ ...td, color: r.ctr >= 1 ? "#22c55e" : r.ctr < 0.6 ? "#ef4444" : undefined }}>{r.ctr.toFixed(2)}%</td>
                          <td style={td}>{money(sym, r.cpc)}</td>
                          <td style={td}>{money(sym, r.spend)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {error && (
            expiredOn(error) !== null ? (
              // Meta's own words for this are a paragraph of API English that
              // tells an owner nothing about what to do. The token simply has to
              // be replaced, so say that and open the box that takes it.
              <div style={{ ...card, borderColor: "rgba(245,158,11,0.45)" }}>
                <strong style={{ color: "#f59e0b", fontSize: 15 }}>🔑 Facebook token expire ho gaya</strong>
                <p style={{ margin: "6px 0 0", fontSize: 13.5, color: "var(--text)", lineHeight: 1.6 }}>
                  Meta ka token {expiredOn(error)} ko khatam ho gaya, isliye ad ke numbers (spend, CTR, CPC) abhi
                  nahi aa rahe. <b>Leads par koi asar nahi</b> — wo alag token se aa rahi hain aur normal chal rahi hain.
                </p>
                <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>
                  Naya token banayein: <b>Graph API Explorer</b> → apni app chunein → permission me <b>ads_read</b> add
                  karein → <b>Generate Access Token</b> → jo lamba code mile wo copy karein. Phir neeche wale button se
                  paste karke Save kar dein. Ad Account ID waisa hi rehne dein.
                </p>
                <button type="button" onClick={() => setSetupOpen(true)}
                  style={{ marginTop: 12, background: "linear-gradient(135deg, #1877F2, #0A52CC)", color: "#fff",
                    padding: "9px 18px", borderRadius: 8, border: "none", fontWeight: 600, cursor: "pointer" }}>
                  Naya token daalein
                </button>
              </div>
            ) : (
              <div style={{ ...card, borderColor: "rgba(248,113,113,0.4)", color: "#f87171", fontSize: 14 }}>{error}</div>
            )
          )}

          {!error && (
            <div style={{ ...card, padding: 0, overflow: "hidden" }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      <th style={{ ...th, textAlign: "left" }}>Campaign / Ad</th>
                      <th style={th}>Impr.</th>
                      <th style={th}>Clicks</th>
                      <th style={th}>CTR</th>
                      <th style={th}>Spend</th>
                      <th style={{ ...th, color: "#1877F2" }}>Leads</th>
                      <th style={{ ...th, color: "#a855f7" }}>Qual.</th>
                      <th style={{ ...th, color: "#22c55e" }}>Booked</th>
                      <th style={{ ...th, color: "#ef4444" }}>Cost/Book</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aggs.length === 0 && (
                      <tr><td colSpan={9} style={{ padding: 24, textAlign: "center", color: "var(--muted)", fontSize: 14 }}>
                        {loaded ? "No ad activity in this period." : "Loading…"}
                      </td></tr>
                    )}
                    {aggs.map((a) => {
                      const open = expanded.has(a.campaign_id);
                      const ctr = a.impressions ? (a.clicks / a.impressions) * 100 : 0;
                      const q = leadQuality(a.crm_leads, a.crm_qualified, a.crm_booked);
                      const anyFatigued = a.ads.some((r) => {
                        const actr = r.impressions ? (r.clicks / r.impressions) * 100 : 0;
                        return !!fatigue(r.frequency, actr);
                      });
                      return (
                        <Fragment key={a.campaign_id}>
                          <tr onClick={() => setExpanded((s) => { const n = new Set(s); n.has(a.campaign_id) ? n.delete(a.campaign_id) : n.add(a.campaign_id); return n; })}
                            style={{ borderTop: "1px solid var(--border)", cursor: "pointer", background: "rgba(255,255,255,0.02)" }}>
                            <td style={{ padding: "10px 10px", fontSize: 13.5, fontWeight: 600, color: "var(--text)", maxWidth: 320 }}>
                              <span style={{ color: "var(--muted)", marginRight: 6 }}>{open ? "▾" : "▸"}</span>
                              {a.campaign_name}
                              {q && (
                                <span title={`Lead quality ${q.score}/100 (from CRM outcomes)`}
                                  style={{ marginLeft: 8, fontSize: 10.5, fontWeight: 700, color: q.tone, border: `1px solid ${q.tone}`, borderRadius: 999, padding: "1px 7px" }}>
                                  Lead {q.grade}
                                </span>
                              )}
                              {(() => {
                                const d = diag[a.campaign_id];
                                if (!d?.verdict || d.verdict === "unknown") return null;
                                const tone = d.verdict === "followup_problem" ? "#f59e0b" : d.verdict === "ad_problem" ? "#ef4444" : "#22c55e";
                                const icon = d.verdict === "followup_problem" ? "\u260E\uFE0F" : d.verdict === "ad_problem" ? "\uD83C\uDFAF" : "\u2705";
                                const short = d.verdict === "followup_problem" ? "Follow-up problem" : d.verdict === "ad_problem" ? "Ad problem" : "Working";
                                return (
                                  <span title={d.verdict_label ?? short}
                                    style={{ marginLeft: 8, fontSize: 10.5, fontWeight: 700, color: tone, border: `1px solid ${tone}`, borderRadius: 999, padding: "1px 7px" }}>
                                    {icon} {short}
                                  </span>
                                );
                              })()}
                              {a.crm_never_called > 0 && (
                                <span title={`${a.crm_never_called} of this campaign's ${a.crm_leads} leads have never been dialled — they drag the grade down without ever getting a chance`}
                                  style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 700, color: "#ef4444", border: "1px solid #ef4444", borderRadius: 999, padding: "1px 7px" }}>
                                  {a.crm_never_called} not called
                                </span>
                              )}
                              {anyFatigued && (
                                <span title="A creative here is fatiguing — high frequency, falling CTR"
                                  style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 700, color: "#f59e0b" }}>🔥 fatigue</span>
                              )}
                              {a.campaign_status && a.campaign_status !== "ACTIVE" && (
                                <span style={{ marginLeft: 8, fontSize: 11, color: "#f59e0b" }}>{a.campaign_status.toLowerCase().replace(/_/g, " ")}</span>
                              )}
                            </td>
                            <td style={td}>{a.impressions.toLocaleString("en-IN")}</td>
                            <td style={td}>{a.clicks.toLocaleString("en-IN")}</td>
                            <td style={td}>{ctr.toFixed(2)}%</td>
                            <td style={td}>{money(sym, a.spend)}</td>
                            <td style={{ ...td, color: "#1877F2", fontWeight: 600 }}>{a.crm_leads}</td>
                            <td style={{ ...td, color: "#a855f7", fontWeight: 600 }}>{a.crm_qualified}</td>
                            <td style={{ ...td, color: "#22c55e", fontWeight: 600 }}>{a.crm_booked}</td>
                            <td style={{ ...td, color: "#ef4444" }}>{a.crm_booked ? money(sym, a.spend / a.crm_booked) : "—"}</td>
                          </tr>
                          {open && a.crm_leads > 0 && (
                            <tr style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                              <td colSpan={9} style={{ padding: 0 }}><WhyThisGrade a={autopsyOf(a)} /></td>
                            </tr>
                          )}
                          {open && a.ads.map((r) => {
                            const actr = r.impressions ? (r.clicks / r.impressions) * 100 : 0;
                            const fat = fatigue(r.frequency, actr);
                            return (
                              <tr key={r.ad_id} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                                <td style={{ padding: "8px 10px 8px 30px", fontSize: 13, color: "var(--muted)", maxWidth: 320 }}>
                                  {r.ad_name}
                                  {r.adset_name && <span style={{ opacity: 0.6 }}> · {r.adset_name}</span>}
                                  {fat && (
                                    <span title={`Frequency ${(r.frequency ?? 0).toFixed(1)}, CTR ${actr.toFixed(2)}% — refresh the creative`}
                                      style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: fat.tone, border: `1px solid ${fat.tone}`, borderRadius: 999, padding: "0 6px" }}>
                                      🔥 {fat.level}
                                    </span>
                                  )}
                                </td>
                                <td style={{ ...td, color: "var(--muted)" }}>{r.impressions.toLocaleString("en-IN")}</td>
                                <td style={{ ...td, color: "var(--muted)" }}>{r.clicks.toLocaleString("en-IN")}</td>
                                <td style={{ ...td, color: "var(--muted)" }}>{actr.toFixed(2)}%</td>
                                <td style={{ ...td, color: "var(--muted)" }}>{money(sym, r.spend)}</td>
                                <td style={{ ...td, color: "#1877F2" }}>{r.crm_leads}</td>
                                <td style={{ ...td, color: "#a855f7" }}>{r.crm_qualified}</td>
                                <td style={{ ...td, color: "#22c55e" }}>{r.crm_booked}</td>
                                <td style={{ ...td, color: "var(--muted)" }}>{r.crm_booked ? money(sym, r.spend / r.crm_booked) : "—"}</td>
                              </tr>
                            );
                          })}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <p style={{ fontSize: 12.5, color: "var(--muted)", margin: 0, lineHeight: 1.6 }}>
            <b style={{ color: "var(--text)" }}>Leads / Qualified / Booked</b> come from YOUR CRM (matched to each ad by its Meta ad id), so
            you see which ads bring real buyers — not just form-fills. <b style={{ color: "var(--text)" }}>Open any campaign</b> to see why it
            got its grade: how many of its leads were never dialled, how long the first call took, and what the people who answered actually
            said — so you can tell a bad ad from a lead nobody worked. Read-only for now; edit mode (pause / budgets) is next.
          </p>
        </>
      )}
    </div>
  );
}

/**
 * The autopsy behind one campaign's letter.
 *
 * A grade tells you an ad was bad. It never tells you whether the ad brought
 * the wrong people or whether nobody worked the leads it brought — and those
 * are opposite problems with opposite fixes, both scoring D. So this shows the
 * three things that decide it: were the leads dialled, how long they waited,
 * and what the ones who answered actually said.
 *
 * The second grade — the same leadQuality() rule run only on the leads someone
 * genuinely spoke to — is the point of the whole panel. When it comes out well
 * above the headline grade, the ad was fine and the follow-up wasn't, and
 * pausing that ad would have thrown away the good one.
 */
function WhyThisGrade({ a }: { a: Autopsy }) {
  const raw = leadQuality(a.leads, a.qualified, a.booked);
  // Capped at `spoke` so this can only ever be a fair reading of the worked
  // leads, never an inflated one.
  const worked = a.spoke > 0 ? leadQuality(a.spoke, Math.min(a.qualified, a.spoke), Math.min(a.booked, a.spoke)) : null;
  const gap = gapToGrade(a.leads, a.qualified, a.booked);
  const move = nextMove(a);
  const pct = (n: number) => (n / Math.max(1, a.leads)) * 100;

  const bar: { n: number; tone: string; label: string }[] = [
    { n: a.never, tone: "#ef4444", label: "Never called" },
    { n: a.missed, tone: "#f59e0b", label: "Called, no answer" },
    { n: a.spoke, tone: "#22c55e", label: "Actually spoke" },
  ];
  const chip: React.CSSProperties = {
    fontSize: 12, background: "rgba(255,255,255,0.05)", border: "1px solid var(--border)",
    borderRadius: 999, padding: "4px 11px", color: "var(--text)", whiteSpace: "nowrap",
  };

  return (
    <div style={{ padding: "16px 18px 18px 30px", background: "rgba(255,255,255,0.02)", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        Why this is a {raw?.grade ?? "—"}
      </div>

      {/* Was the lead even reached? These three add up to every lead. */}
      <div>
        <div style={{ display: "flex", height: 10, borderRadius: 999, overflow: "hidden", background: "rgba(255,255,255,0.06)" }}>
          {bar.map((s) => s.n > 0 ? <div key={s.label} title={`${s.label}: ${s.n}`} style={{ width: `${pct(s.n)}%`, background: s.tone }} /> : null)}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 8 }}>
          {bar.map((s) => (
            <span key={s.label} style={{ fontSize: 12.5, color: "var(--muted)" }}>
              <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: s.tone, marginRight: 6 }} />
              {s.label} <b style={{ color: "var(--text)" }}>{s.n}</b>
              <span style={{ opacity: 0.7 }}> · {Math.round(pct(s.n))}%</span>
            </span>
          ))}
        </div>
      </div>

      {/* The grade with our own follow-up taken out of it. */}
      {worked && a.never + a.missed > 0 && (
        <div style={{ fontSize: 13.5, color: "var(--text)", lineHeight: 1.6 }}>
          Judged only on the <b>{a.spoke}</b> leads someone actually spoke to, this ad is a{" "}
          <b style={{ color: worked.tone }}>{worked.grade}</b>
          {raw && worked.grade !== raw.grade
            ? <> — not a <b style={{ color: raw.tone }}>{raw.grade}</b>. The gap between those two letters is our follow-up, not the ad.</>
            : <> — the same as its headline grade, so the follow-up isn&apos;t what&apos;s holding it back.</>}
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <span style={{ ...chip, borderColor: a.mins >= 60 ? "rgba(245,158,11,0.5)" : undefined }}>
          ⏱ First call after <b style={{ color: a.mins >= 60 ? "#f59e0b" : "#22c55e" }}>{fmtMins(a.mins)}</b>
        </span>
        <span style={chip}>✅ Qualified <b style={{ color: "#a855f7" }}>{a.qualified}</b></span>
        <span style={chip}>🏆 Booked <b style={{ color: "#22c55e" }}>{a.booked}</b></span>
        <span style={chip}>🙅 Said no <b>{a.no}</b></span>
        <span style={chip}>🚫 Wrong number / DNC <b>{a.junk}</b></span>
        <span style={chip}>🔁 Still open <b>{a.open}</b></span>
      </div>

      {gap && (
        <div style={{ fontSize: 13.5, color: "var(--text)" }}>
          <b style={{ color: gap.tone }}>{gap.need} more</b> of these {a.leads} leads reaching Interested would have made this a{" "}
          <b style={{ color: gap.tone }}>{gap.grade}</b>.
        </div>
      )}

      {move && (
        <div style={{ background: `${move.tone}12`, border: `1px solid ${move.tone}55`, borderRadius: 12, padding: "12px 14px" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: move.tone }}>{move.icon} {move.title}</div>
          <div style={{ fontSize: 13.5, color: "var(--text)", marginTop: 5, lineHeight: 1.6 }}>{move.detail}</div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone, delta, hint }:{ label: string; value: string; tone: string; delta?: { pct: number; good: boolean } | null; hint?: string }) {
  return (
    <div style={{ background: `${tone}0d`, border: `1px solid ${tone}22`, borderRadius: 14, padding: "16px 18px" }}>
      <div style={{ color: tone, fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</div>
      <div style={{ color: tone, fontSize: 24, fontWeight: 800, marginTop: 6 }}>{value}</div>
      {delta && (
        <div style={{ marginTop: 4, fontSize: 12, fontWeight: 600, color: delta.good ? "#22c55e" : "#ef4444" }}>
          {delta.pct >= 0 ? "▲" : "▼"} {Math.abs(delta.pct)}% <span style={{ color: "var(--muted)", fontWeight: 400 }}>vs prev</span>
        </div>
      )}
      {hint && <div style={{ marginTop: 4, fontSize: 11.5, color: "var(--muted)" }}>{hint}</div>}
    </div>
  );
}
