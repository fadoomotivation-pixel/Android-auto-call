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

  const sym = symbolOf(currency);

  const load = useCallback(async (p: string) => {
    setLoading(true); setError(null);
    const { data, error } = await supabase.functions.invoke<{ ok: boolean; error?: string; currency?: string; rows?: Row[] }>(
      "ads-insights",
      { body: { company: companyId, date_preset: p } },
    );
    setLoading(false); setLoaded(true);
    if (error || !data?.ok) { setError(data?.error || error?.message || "Couldn't load ads data."); setRows([]); return; }
    setCurrency(data.currency ?? "");
    setRows(data.rows ?? []);
  }, [supabase, companyId]);

  useEffect(() => { if (isConfigured) void load(preset); }, [isConfigured, preset, load]);

  async function save() {
    if (!acctId.trim()) { setSaveMsg("Enter your Ad Account ID."); return; }
    setSaving(true); setSaveMsg(null);
    const { error } = await supabase.rpc("set_facebook_ads", {
      p_company: companyId, p_ad_account_id: acctId.trim(), p_token: token.trim() || null,
    });
    setSaving(false);
    if (error) { setSaveMsg("Couldn't save: " + error.message); return; }
    setToken(""); setSaveMsg("Saved ✓"); setIsConfigured(true); setSetupOpen(false);
    void load(preset);
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
              {PRESETS.map((p) => (
                <button key={p.key} onClick={() => setPreset(p.key)}
                  style={{ padding: "7px 14px", borderRadius: 999, cursor: "pointer", fontSize: 13,
                    border: `1px solid ${preset === p.key ? "var(--accent)" : "var(--border)"}`,
                    background: preset === p.key ? "var(--accent)" : "rgba(255,255,255,0.03)",
                    color: preset === p.key ? "#fff" : "var(--text)" }}>
                  {p.label}
                </button>
              ))}
            </div>
            <button onClick={() => load(preset)} disabled={loading}
              style={{ fontSize: 12, padding: "7px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "rgba(255,255,255,0.04)", color: "var(--muted)", cursor: "pointer" }}>
              {loading ? "Loading…" : "🔄 Refresh"}
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
            <Stat label="Spend" value={money(sym, totals.spend)} tone="#f59e0b" />
            <Stat label="Leads (CRM)" value={totals.leads.toLocaleString("en-IN")} tone="#1877F2" />
            <Stat label="Qualified" value={totals.qualified.toLocaleString("en-IN")} tone="#a855f7" />
            <Stat label="Booked" value={totals.booked.toLocaleString("en-IN")} tone="#22c55e" />
            <Stat label="Cost / Booked" value={totals.booked ? money(sym, totals.spend / totals.booked) : "—"} tone="#ef4444" />
          </div>

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

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div style={{ background: `${tone}0d`, border: `1px solid ${tone}22`, borderRadius: 14, padding: "16px 18px" }}>
      <div style={{ color: tone, fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</div>
      <div style={{ color: tone, fontSize: 24, fontWeight: 800, marginTop: 6 }}>{value}</div>
    </div>
  );
}
