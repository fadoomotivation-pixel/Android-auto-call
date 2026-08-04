"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { createClient } from "@/lib/supabase/client";
import { ist, istDate } from "@/lib/dashboard/format";

interface Row {
  company_id: string;
  company_name: string | null;
  salesperson_id: string;
  rep_name: string | null;
  period_start: string;
  call_id: string;
  rating: number;
  started_at: string;
  duration_seconds: number | null;
  contact_id: string | null;
  contact_name: string | null;
  phone: string | null;
  good: string | null;
  improve: string | null;
  has_recording: boolean;
}

const mmss = (s: number | null) => {
  if (!s) return "—";
  const m = Math.floor(s / 60);
  return m ? `${m}m ${s % 60}s` : `${s}s`;
};

/**
 * The best call each rep made, per day or per week.
 *
 * The score is NOT invented here — it is the AI Coach's own honest 1-5 rating
 * from coach_feedback, the same number the rep already sees on their own call.
 * A second, disagreeing "best call" metric would make both untrustworthy.
 */
export function BestCalls({ isSuper }: { isSuper: boolean }) {
  const supabase = createClient();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [period, setPeriod] = useState<"day" | "week">("day");
  const [days, setDays] = useState(14);
  const [company, setCompany] = useState("all");
  const [rep, setRep] = useState("all");
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    setRows(null);
    const { data, error } = await supabase.rpc("best_calls", { p_period: period, p_days: days });
    if (error) { setErr(error.message); return; }
    setRows((data as Row[]) ?? []);
  }, [supabase, period, days]);

  useEffect(() => { void load(); }, [load]);

  const companies = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows ?? []) m.set(r.company_id, r.company_name ?? "Company");
    return [...m.entries()];
  }, [rows]);

  const reps = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows ?? []) {
      if (company !== "all" && r.company_id !== company) continue;
      m.set(r.salesperson_id, r.rep_name ?? "Telecaller");
    }
    return [...m.entries()];
  }, [rows, company]);

  const shown = useMemo(() => {
    return (rows ?? [])
      .filter((r) => (company === "all" || r.company_id === company))
      .filter((r) => (rep === "all" || r.salesperson_id === rep))
      .sort((a, b) => b.period_start.localeCompare(a.period_start) || b.rating - a.rating);
  }, [rows, company, rep]);

  const card: CSSProperties = {
    background: "rgba(255,255,255,0.015)", border: "1px solid var(--border)",
    borderRadius: 16, padding: 18, marginBottom: 12,
  };

  return (
    <div style={{ marginTop: 26 }}>
      <h3 style={{ margin: 0, color: "#fff" }}>🏆 Best call of the {period === "day" ? "day" : "week"}</h3>
      <p className="subtitle" style={{ margin: "6px 0 0" }}>
        Each telecaller&apos;s highest-rated call, with the coach&apos;s own reason for the score. Rated 1-5 by the
        AI Coach — the same score the rep sees. Between two equal scores the longer call wins.
      </p>

      <div style={{ display: "flex", gap: 10, alignItems: "center", margin: "12px 0", flexWrap: "wrap" }}>
        <select value={period} onChange={(e) => setPeriod(e.target.value as "day" | "week")} style={{ width: "auto" }}>
          <option value="day">Daily</option>
          <option value="week">Weekly</option>
        </select>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ width: "auto" }}>
          <option value={7}>Last 7 days</option>
          <option value={14}>Last 14 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
        {isSuper && companies.length > 1 && (
          <select value={company} onChange={(e) => { setCompany(e.target.value); setRep("all"); }} style={{ width: "auto" }}>
            <option value="all">🏢 All companies</option>
            {companies.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        )}
        {reps.length > 1 && (
          <select value={rep} onChange={(e) => setRep(e.target.value)} style={{ width: "auto" }}>
            <option value="all">All telecallers</option>
            {reps.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        )}
        <button className="link" onClick={() => void load()}>Refresh</button>
      </div>

      {err && <div className="error" style={{ marginBottom: 10 }}>{err}</div>}
      {!rows && <div className="empty">Loading…</div>}
      {rows && shown.length === 0 && (
        <div className="empty">
          No rated calls in this window. The coach rates a call once it has a recording it can listen to —
          check Phone Health if recordings aren&apos;t arriving.
        </div>
      )}

      {shown.map((r) => (
        <div key={r.call_id} style={card}>
          <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
            <span style={{
              fontSize: 13, fontWeight: 700,
              color: r.rating >= 4 ? "#22c55e" : r.rating >= 3 ? "#f59e0b" : "#ef4444",
              border: `1px solid ${r.rating >= 4 ? "#22c55e" : r.rating >= 3 ? "#f59e0b" : "#ef4444"}`,
              borderRadius: 999, padding: "2px 10px",
            }}>{r.rating}/5</span>
            <strong style={{ color: "#fff", fontSize: 15 }}>{r.rep_name ?? "Telecaller"}</strong>
            {isSuper && <span style={{ fontSize: 12.5, color: "var(--muted)" }}>· {r.company_name ?? "—"}</span>}
            <span style={{ fontSize: 12.5, color: "var(--muted)" }}>
              · {period === "day" ? "on" : "week of"}{" "}
              {istDate(r.period_start)}
            </span>
            <span style={{ marginLeft: "auto", fontSize: 12.5, color: "var(--muted)" }}>
              {mmss(r.duration_seconds)} · {ist(r.started_at)}
            </span>
          </div>

          <div style={{ fontSize: 13, color: "var(--text)", marginTop: 8 }}>
            Customer: <strong>{r.contact_name || r.phone || "—"}</strong>
            {!r.has_recording && <span style={{ color: "var(--muted)" }}> · recording not saved</span>}
          </div>

          {r.good && (
            <div style={{ fontSize: 13, color: "#22c55e", marginTop: 6, lineHeight: 1.55 }}>
              ✅ {r.good}
            </div>
          )}
          {r.improve && (
            <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 4, lineHeight: 1.55 }}>
              💡 {r.improve}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
