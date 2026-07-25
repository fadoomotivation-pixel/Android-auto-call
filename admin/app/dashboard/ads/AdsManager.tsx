"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Row = {
  campaign_id: string; campaign_name: string; campaign_status: string;
  adset_id: string; adset_name: string;
  ad_id: string; ad_name: string;
  impressions: number; clicks: number; spend: number; ctr: number; cpc: number;
  meta_leads: number; crm_leads: number; crm_qualified: number; crm_booked: number;
};

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
  ads: Row[];
};

function rollUp(rows: Row[]): Agg[] {
  const by = new Map<string, Agg>();
  for (const r of rows) {
    const a = by.get(r.campaign_id) ?? {
      campaign_id: r.campaign_id, campaign_name: r.campaign_name, campaign_status: r.campaign_status,
      impressions: 0, clicks: 0, spend: 0, meta_leads: 0, crm_leads: 0, crm_qualified: 0, crm_booked: 0, ads: [],
    };
    a.impressions += r.impressions; a.clicks += r.clicks; a.spend += r.spend;
    a.meta_leads += r.meta_leads; a.crm_leads += r.crm_leads; a.crm_qualified += r.crm_qualified; a.crm_booked += r.crm_booked;
    a.ads.push(r);
    by.set(r.campaign_id, a);
  }
  return Array.from(by.values()).sort((x, y) => y.spend - x.spend);
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
  useEffect(() => { setAdvice(null); setAdvErr(null); }, [rows, preset]);

  async function runAdvisor() {
    if (rows.length === 0) { setAdvErr("Load your ads first, then ask the advisor."); return; }
    setAdvising(true); setAdvErr(null);
    const rangeLabel = PRESETS.find((p) => p.key === preset)?.label ?? preset;
    const { data, error } = await supabase.functions.invoke<{ ok: boolean; error?: string; advice?: Advice }>(
      "ad-advisor",
      { body: { rows, currency, company_id: companyId, range: rangeLabel } },
    );
    setAdvising(false);
    if (error || !data?.ok || !data.advice) { setAdvErr(data?.error || error?.message || "Couldn't analyse right now."); return; }
    setAdvice(data.advice);
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
  }), { spend: 0, leads: 0, qualified: 0, booked: 0 });

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
          </div>
          {prevTotals && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: -6 }}>▲▼ = change vs the previous {preset === "custom" ? "period" : (PRESETS.find((p) => p.key === preset)?.label ?? "period").toLowerCase()}.</div>}

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

          {error && <div style={{ ...card, borderColor: "rgba(248,113,113,0.4)", color: "#f87171", fontSize: 14 }}>{error}</div>}

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
                      return (
                        <Fragment key={a.campaign_id}>
                          <tr onClick={() => setExpanded((s) => { const n = new Set(s); n.has(a.campaign_id) ? n.delete(a.campaign_id) : n.add(a.campaign_id); return n; })}
                            style={{ borderTop: "1px solid var(--border)", cursor: "pointer", background: "rgba(255,255,255,0.02)" }}>
                            <td style={{ padding: "10px 10px", fontSize: 13.5, fontWeight: 600, color: "var(--text)", maxWidth: 320 }}>
                              <span style={{ color: "var(--muted)", marginRight: 6 }}>{open ? "▾" : "▸"}</span>
                              {a.campaign_name}
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
                          {open && a.ads.map((r) => {
                            const actr = r.impressions ? (r.clicks / r.impressions) * 100 : 0;
                            return (
                              <tr key={r.ad_id} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                                <td style={{ padding: "8px 10px 8px 30px", fontSize: 13, color: "var(--muted)", maxWidth: 320 }}>
                                  {r.ad_name}
                                  {r.adset_name && <span style={{ opacity: 0.6 }}> · {r.adset_name}</span>}
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
            you see which ads bring real buyers — not just form-fills. Read-only for now; edit mode (pause / budgets) is next.
          </p>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, tone, delta }: { label: string; value: string; tone: string; delta?: { pct: number; good: boolean } | null }) {
  return (
    <div style={{ background: `${tone}0d`, border: `1px solid ${tone}22`, borderRadius: 14, padding: "16px 18px" }}>
      <div style={{ color: tone, fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</div>
      <div style={{ color: tone, fontSize: 24, fontWeight: 800, marginTop: 6 }}>{value}</div>
      {delta && (
        <div style={{ marginTop: 4, fontSize: 12, fontWeight: 600, color: delta.good ? "#22c55e" : "#ef4444" }}>
          {delta.pct >= 0 ? "▲" : "▼"} {Math.abs(delta.pct)}% <span style={{ color: "var(--muted)", fontWeight: 400 }}>vs prev</span>
        </div>
      )}
    </div>
  );
}
