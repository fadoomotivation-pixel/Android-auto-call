"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Objection = { label: string; count: number; quote: string; fix: string };
type Demand = { what: string; count: number };
type Gold = { name: string; phone: string; why: string; opener: string };
type Report = {
  headline?: string;
  objections?: Objection[];
  demand?: Demand[];
  winning?: string[];
  gold?: Gold[];
  advice?: string[];
  stats?: { conversations: number; leads: number; days: number; distribution?: string };
};

export function XrayClient() {
  const [report, setReport] = useState<Report | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Open instantly with the latest stored report (the Monday cron keeps it fresh).
  const loadStored = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("sales_xray")
      .select("report, created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) {
      setReport(data.report as Report);
      setGeneratedAt(data.created_at as string);
    }
  }, []);

  useEffect(() => { loadStored(); }, [loadStored]);

  // Fresh scan on demand.
  async function regenerate() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { data, error } = await supabase.functions.invoke<{
      ok: boolean; error?: string; report?: Report; skipped?: string;
    }>("sales-xray", { body: {} });
    setBusy(false);
    if (error || !data?.ok) {
      setError(data?.error || error?.message || "X-Ray failed.");
      return;
    }
    if (data.skipped) {
      setError(`Not enough data yet: ${data.skipped}`);
      return;
    }
    if (data.report) {
      setReport(data.report);
      setGeneratedAt(new Date().toISOString());
    }
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "14px 0 20px" }}>
        <button className="primary" onClick={regenerate} disabled={busy} style={{ padding: "10px 18px" }}>
          {busy ? "Scanning every conversation…" : "🔄 Run fresh X-Ray"}
        </button>
        {generatedAt && (
          <span className="subtitle" style={{ margin: 0 }}>
            Last scan: {new Date(generatedAt).toLocaleString()}
            {report?.stats && <> · {report.stats.conversations} conversations · {report.stats.leads} leads · {report.stats.days}d</>}
          </span>
        )}
      </div>
      {error && <div className="error" style={{ marginBottom: 16 }}>{error}</div>}
      {!report && !error && <div className="empty">No X-Ray yet — run your first scan above.</div>}

      {report && (
        <>
          {report.headline && (
            <div className="card" style={{ marginBottom: 20, borderLeft: "3px solid var(--accent)" }}>
              <div style={{ fontSize: 17, fontWeight: 600, color: "#fff", lineHeight: 1.5 }}>{report.headline}</div>
            </div>
          )}

          <div className="split-2">
            {/* Deal killers */}
            <div className="card">
              <div className="label">☠️ Deal killers — kyun mar rahi hain leads</div>
              {(report.objections ?? []).map((o, i) => (
                <div key={i} style={{ padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span style={{ color: "#fff", fontWeight: 600 }}>{o.label}</span>
                    <span className="badge dnc">{o.count} leads</span>
                  </div>
                  <div style={{ color: "var(--muted)", fontSize: 13, margin: "4px 0", fontStyle: "italic" }}>
                    &ldquo;{o.quote}&rdquo;
                  </div>
                  <div style={{ fontSize: 13, color: "var(--good)" }}>↳ {o.fix}</div>
                </div>
              ))}
            </div>

            {/* Demand map */}
            <div className="card">
              <div className="label">📈 Demand — buyers kya maang rahe hain</div>
              {(report.demand ?? []).map((d, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ color: "#fff" }}>{d.what}</span>
                  <span style={{ color: "var(--accent)", fontWeight: 700 }}>{d.count}</span>
                </div>
              ))}
              {(report.winning ?? []).length > 0 && (
                <>
                  <div className="label" style={{ marginTop: 18 }}>🏆 Winning calls me common</div>
                  {(report.winning ?? []).map((w, i) => (
                    <div key={i} style={{ padding: "6px 0", fontSize: 14, color: "var(--muted)" }}>• {w}</div>
                  ))}
                </>
              )}
            </div>
          </div>

          {/* Recoverable gold */}
          <h3 className="section-h">💰 Recoverable gold — ye leads wapas jeeti ja sakti hain</h3>
          {(report.gold ?? []).length === 0 ? (
            <div className="empty">AI found no confidently recoverable leads in this window.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Lead</th><th>Phone</th><th>Kyun winnable</th><th>Opening line (bol ke dekho)</th></tr>
                </thead>
                <tbody>
                  {(report.gold ?? []).map((g, i) => (
                    <tr key={i} className="hover-row">
                      <td style={{ color: "#fff", fontWeight: 500 }}>{g.name}</td>
                      <td style={{ whiteSpace: "nowrap" }}>{g.phone}</td>
                      <td style={{ color: "var(--muted)" }}>{g.why}</td>
                      <td style={{ color: "var(--good)" }}>&ldquo;{g.opener}&rdquo;</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* This week's moves */}
          {(report.advice ?? []).length > 0 && (
            <div className="card" style={{ marginTop: 20 }}>
              <div className="label">🎯 Owner ke liye is hafte ke 3 moves</div>
              {(report.advice ?? []).map((a, i) => (
                <div key={i} style={{ padding: "6px 0", color: "#fff", fontSize: 14 }}>{i + 1}. {a}</div>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
