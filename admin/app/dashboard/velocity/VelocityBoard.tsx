"use client";

import { useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { createClient } from "@/lib/supabase/client";
import { BandDrill, type BandKey } from "./BandDrill";

interface Summary {
  days: number; total_leads: number;
  never_called: number; never_called_pct: number; never_called_advanced: number;
  median_minutes: number | null; answered_in_30m_pct: number;
  fast_advance_pct: number; slow_advance_pct: number;
  speed_multiple: number | null; missed_deals: number; burnt_spend: number | null;
}
interface Bucket { label: string; leads: number; advanced: number; advance_pct: number }
interface GroupRow { id: string; name: string; leads: number; never_called: number; never_pct: number; median_minutes: number | null; advance_pct: number }
interface Leak { name: string | null; company: string | null; source: string; age_hours: number; status: string }
interface Verdict { verdict?: string; moves?: { title?: string; why?: string; how?: string }[]; one_number?: string }
interface Payload {
  ok: boolean; empty?: boolean; error?: string;
  summary?: Summary; buckets?: Bucket[]; companies?: GroupRow[]; reps?: GroupRow[];
  unassigned?: number; leak_list?: Leak[]; verdict?: Verdict | null;
}

const DAYS = [7, 30, 90];

/**
 * The chart's band labels, mapped to the keys BandDrill filters by.
 *
 * Deliberately keyed on the label the edge function sends rather than on
 * position: if a band is renamed and this map is not updated, the lookup
 * returns undefined and that row simply stays un-clickable — which is visible.
 * Position-based mapping would silently open the WRONG list of leads.
 */
const BAND_BY_LABEL: Record<string, BandKey | undefined> = {
  "0-5 min": "b5",
  "5-30 min": "b30",
  "30 min - 2 hrs": "b120",
  "2 - 24 hrs": "b1440",
  "24 hrs+": "bmore",
};

/** Minutes → "4 min" / "2h 10m" / "3d". */
function dur(mins: number | null): string {
  if (mins == null) return "—";
  if (mins < 60) return `${Math.round(mins)} min`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ${Math.round(mins % 60)}m`;
  return `${Math.round(mins / 1440)}d`;
}

export function VelocityBoard({ isSuper }: { isSuper: boolean }) {
  const supabase = createClient();
  const [days, setDays] = useState(30);
  const [cpl, setCpl] = useState("");
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Which band the manager opened, if any. One at a time: two open tables is a
  // page you scroll rather than a question you answered.
  const [band, setBand] = useState<BandKey | null>(null);

  const load = useCallback(async (d: number, costPerLead: number) => {
    setLoading(true); setErr(null);
    const { data: res, error } = await supabase.functions.invoke<Payload>("sales-velocity", {
      body: { days: d, cost_per_lead: costPerLead || undefined },
    });
    setLoading(false);
    if (error || !res?.ok) { setErr(res?.error || error?.message || "Couldn't load."); setData(null); return; }
    setData(res);
  }, [supabase]);

  useEffect(() => { void load(days, Number(cpl)); }, [days, load]); // eslint-disable-line react-hooks/exhaustive-deps

  const s = data?.summary;
  const maxAdv = Math.max(1, ...(data?.buckets ?? []).map((b) => b.advance_pct));

  const card: CSSProperties = { background: "var(--panel-grad, var(--panel))", border: "1px solid var(--border)", borderRadius: 18, padding: 22 };
  const th: CSSProperties = { textAlign: "right", padding: "8px 10px", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--muted)", whiteSpace: "nowrap" };
  const td: CSSProperties = { textAlign: "right", padding: "9px 10px", fontSize: 13, whiteSpace: "nowrap" };

  function table(title: string, rows: GroupRow[], label: string) {
    if (rows.length === 0) return null;
    return (
      <div style={card}>
        <strong style={{ color: "#fff", fontSize: 15 }}>{title}</strong>
        <div style={{ overflowX: "auto", marginTop: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th style={{ ...th, textAlign: "left" }}>{label}</th>
                <th style={th}>Leads</th>
                <th style={th}>Median 1st call</th>
                <th style={th}>Never called</th>
                <th style={th}>Advance %</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 12).map((r) => (
                <tr key={r.id} style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                  <td style={{ ...td, textAlign: "left", color: "#fff" }}>{r.name}</td>
                  <td style={td}>{r.leads}</td>
                  <td style={{ ...td, color: r.median_minutes != null && r.median_minutes <= 30 ? "#22c55e" : r.median_minutes != null && r.median_minutes > 240 ? "#ef4444" : undefined }}>
                    {dur(r.median_minutes)}
                  </td>
                  <td style={{ ...td, color: r.never_pct >= 40 ? "#ef4444" : r.never_pct >= 15 ? "#f59e0b" : "var(--muted)" }}>
                    {r.never_called} <span style={{ opacity: 0.6 }}>({r.never_pct}%)</span>
                  </td>
                  <td style={{ ...td, fontWeight: 600, color: r.advance_pct >= 15 ? "#22c55e" : undefined }}>{r.advance_pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Controls */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        {DAYS.map((d) => (
          <button key={d} onClick={() => setDays(d)}
            style={{ padding: "7px 14px", borderRadius: 999, cursor: "pointer", fontSize: 13,
              border: `1px solid ${days === d ? "var(--accent)" : "var(--border)"}`,
              background: days === d ? "var(--accent)" : "rgba(255,255,255,0.03)",
              color: days === d ? "#fff" : "var(--text)" }}>
            Last {d} days
          </button>
        ))}
        <span style={{ display: "inline-flex", gap: 6, alignItems: "center", marginLeft: "auto" }}>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>Cost per lead ₹</span>
          <input value={cpl} onChange={(e) => setCpl(e.target.value.replace(/[^0-9]/g, ""))}
            onBlur={() => void load(days, Number(cpl))} placeholder="e.g. 350"
            style={{ width: 90, padding: "6px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "rgba(255,255,255,0.03)", color: "var(--text)", fontSize: 13 }} />
        </span>
      </div>

      {err && <div className="error">{err}</div>}
      {loading && !data && <div className="subtitle">Measuring your funnel…</div>}
      {data?.empty && <div className="empty">No leads in this window yet.</div>}

      {s && (
        <>
          {/* Headline numbers */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
            <Tile label="Median 1st call" value={dur(s.median_minutes)} tone={s.median_minutes != null && s.median_minutes <= 30 ? "#22c55e" : "#f59e0b"}
              sub={`${s.answered_in_30m_pct}% answered in 30 min`} />
            <Tile label="Never called" value={`${s.never_called}`} tone={s.never_called_pct >= 25 ? "#ef4444" : "#f59e0b"}
              sub={`${s.never_called_pct}% of ${s.total_leads} leads`}
              onClick={() => setBand((b) => (b === "never" ? null : "never"))}
              active={band === "never"} />
            <Tile label="Speed advantage" value={s.speed_multiple ? `${s.speed_multiple}×` : "—"} tone="#0A84FF"
              sub={`${s.fast_advance_pct}% vs ${s.slow_advance_pct}% advance`} />
            <Tile label="Deals left on table" value={`~${s.missed_deals}`} tone="#a855f7"
              sub="if slow leads were answered fast" />
            {s.burnt_spend != null && (
              <Tile label="Ad spend burnt" value={`₹${s.burnt_spend.toLocaleString("en-IN")}`} tone="#ef4444"
                sub="paid for, never called" />
            )}
          </div>

          {/* The proof */}
          <div style={card}>
            <strong style={{ color: "#fff", fontSize: 15 }}>⏱️ Speed decides the sale</strong>
            <p className="subtitle" style={{ margin: "2px 0 14px" }}>
              Your own leads, grouped by how fast the first call went out. &ldquo;Advance&rdquo; = the lead reached
              Interested, Site&nbsp;Visit or Booking.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {(data.buckets ?? []).map((b) => {
                const key = BAND_BY_LABEL[b.label];
                const isOpen = key != null && band === key;
                return (
                <div key={b.label}
                  role={key ? "button" : undefined}
                  tabIndex={key ? 0 : undefined}
                  onClick={key ? () => setBand((cur) => (cur === key ? null : key)) : undefined}
                  onKeyDown={key ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setBand((cur) => (cur === key ? null : key));
                    }
                  } : undefined}
                  style={{
                    display: "flex", alignItems: "center", gap: 12,
                    cursor: key ? "pointer" : "default",
                    background: isOpen ? "rgba(255,255,255,0.05)" : "transparent",
                    borderRadius: 8, padding: "2px 6px", margin: "0 -6px",
                  }}>
                  <div style={{ width: 110, fontSize: 13, color: "var(--text)" }}>{b.label}</div>
                  <div style={{ flex: 1, height: 22, background: "rgba(255,255,255,0.05)", borderRadius: 999, overflow: "hidden" }}>
                    <div style={{ width: `${Math.max(2, (b.advance_pct / maxAdv) * 100)}%`, height: "100%", borderRadius: 999,
                      background: "linear-gradient(90deg, var(--accent), #64a8ff)" }} />
                  </div>
                  <div style={{ width: 62, textAlign: "right", fontSize: 13, fontWeight: 700, color: "#fff" }}>{b.advance_pct}%</div>
                  <div style={{ width: 74, textAlign: "right", fontSize: 12, color: "var(--muted)" }}>{b.leads} leads</div>
                </div>
              );})}
            </div>
            <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 10 }}>
              Click any band to see the leads in it.
            </div>
            {band && <BandDrill band={band} days={days} onClose={() => setBand(null)} />}
          </div>

          {/* AI verdict */}
          {data.verdict?.verdict && (
            <div style={{ ...card, background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.28)" }}>
              <strong style={{ color: "#fff", fontSize: 15 }}>🧠 What this costs you — and the fix</strong>
              <div style={{ fontSize: 16, fontWeight: 600, color: "#fff", margin: "10px 0 4px", letterSpacing: "-0.01em" }}>
                {data.verdict.verdict}
              </div>
              {data.verdict.one_number && (
                <div style={{ display: "inline-block", marginTop: 6, fontSize: 12.5, fontWeight: 700, color: "#0A84FF",
                  border: "1px solid rgba(10,132,255,0.5)", borderRadius: 999, padding: "3px 12px" }}>
                  🎯 {data.verdict.one_number}
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
                {(data.verdict.moves ?? []).map((m, i) => (
                  <div key={i} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 14px" }}>
                    <strong style={{ color: "#fff", fontSize: 14 }}>{i + 1}. {m.title}</strong>
                    {m.why && <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 5 }}>{m.why}</div>}
                    {m.how && <div style={{ fontSize: 13.5, color: "var(--text)", marginTop: 5 }}>👉 {m.how}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {isSuper && table("🏢 By company", data.companies ?? [], "Company")}
          {table("👤 By telecaller", data.reps ?? [], "Telecaller")}

          {/* The leak list */}
          {(data.leak_list ?? []).length > 0 && (
            <div style={{ ...card, border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.04)" }}>
              <strong style={{ color: "#fff", fontSize: 15 }}>🩸 Paid for, never called</strong>
              <p className="subtitle" style={{ margin: "2px 0 12px" }}>
                Oldest untouched leads — every one of these cost money to acquire and has never had a single call.
              </p>
              {/* The unassigned ones are the SAME pool Lead Routing hands out.
                  Saying so — and linking — stops this reading like a second,
                  separate backlog to chase. */}
              {!!data.unassigned && (
                <p className="subtitle" style={{ margin: "-6px 0 12px" }}>
                  <strong style={{ color: "#fca5a5" }}>{data.unassigned}</strong> of these have no telecaller at all.
                  Those are the leads waiting in the pool —{" "}
                  <a href="/dashboard/routing" style={{ color: "var(--accent)" }}>Lead Routing hands them out →</a>
                </p>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {(data.leak_list ?? []).map((l, i) => (
                  <div key={i} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13, padding: "7px 0", borderTop: i ? "1px solid rgba(255,255,255,0.05)" : undefined }}>
                    <span style={{ color: "#fca5a5", fontWeight: 600, width: 74 }}>{l.age_hours >= 48 ? `${Math.round(l.age_hours / 24)}d old` : `${l.age_hours}h old`}</span>
                    <span style={{ color: "var(--text)" }}>{l.company ?? "—"}</span>
                    <span style={{ color: "var(--muted)" }}>· {l.name ?? "unassigned"}</span>
                    <span style={{ marginLeft: "auto", color: "var(--muted)", fontSize: 12 }}>{l.source}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Tile({ label, value, tone, sub, onClick, active }: {
  label: string; value: string; tone: string; sub?: string;
  onClick?: () => void; active?: boolean;
}) {
  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); }
      } : undefined}
      style={{
        background: `${tone}0d`,
        border: `1px solid ${active ? tone : `${tone}22`}`,
        borderRadius: 14, padding: "16px 18px",
        cursor: onClick ? "pointer" : "default",
      }}>
      <div style={{ color: tone, fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</div>
      <div style={{ color: tone, fontSize: 26, fontWeight: 800, marginTop: 6 }}>{value}</div>
      {sub && <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}
