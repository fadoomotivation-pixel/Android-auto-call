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

type Company = { id: string; name: string | null };
/** One company's stored report, for the all-companies overview. */
type Across = { companyId: string; name: string; report: Report; at: string };

export function XrayClient({ isSuper = false, companies = [] }: { isSuper?: boolean; companies?: Company[] }) {
  const [report, setReport] = useState<Report | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Super admin picks whose X-Ray to read; regular admin is scoped by RLS.
  // "" = every company at once — the platform owner runs several businesses and
  // should not have to open each one to find which is bleeding.
  const [companyId, setCompanyId] = useState<string>("");
  const [across, setAcross] = useState<Across[] | null>(null);

  // Open instantly with the latest stored report (the Monday cron keeps it fresh).
  const loadStored = useCallback(async () => {
    const supabase = createClient();
    let q = supabase
      .from("sales_xray")
      .select("report, created_at")
      .order("created_at", { ascending: false })
      .limit(1);
    // Without this filter a super admin would see whichever company's report is
    // newest — pin it to the selected company instead.
    if (isSuper && companyId) q = q.eq("company_id", companyId);
    const { data } = await q.maybeSingle();
    if (data) {
      setReport(data.report as Report);
      setGeneratedAt(data.created_at as string);
    } else {
      setReport(null);
      setGeneratedAt(null);
    }
  }, [isSuper, companyId]);

  useEffect(() => { loadStored(); }, [loadStored]);

  // All-companies overview: read the reports the Monday cron already wrote —
  // newest one per company. No second AI pass and no parallel analysis logic;
  // it is the same sales_xray table the single-company view reads.
  const loadAcross = useCallback(async () => {
    if (!isSuper || companyId) { setAcross(null); return; }
    const supabase = createClient();
    const { data } = await supabase
      .from("sales_xray")
      .select("company_id, report, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    const seen = new Set<string>();
    const rows: Across[] = [];
    for (const r of data ?? []) {
      const cid = r.company_id as string;
      if (seen.has(cid)) continue;
      seen.add(cid);
      rows.push({
        companyId: cid,
        name: companies.find((c) => c.id === cid)?.name ?? "Company",
        report: r.report as Report,
        at: r.created_at as string,
      });
    }
    setAcross(rows);
  }, [isSuper, companyId, companies]);

  useEffect(() => { void loadAcross(); }, [loadAcross]);

  // Fresh scan on demand.
  async function regenerate() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { data, error } = await supabase.functions.invoke<{
      ok: boolean; error?: string; report?: Report; skipped?: string;
    }>("sales-xray", { body: isSuper && companyId ? { company_id: companyId } : {} });
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
      <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "14px 0 20px", flexWrap: "wrap" }}>
        {isSuper && (
          <select
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
            style={{ padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "rgba(255,255,255,0.02)", color: "var(--text)", minWidth: 200 }}
          >
            <option value="">🏢 All companies</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name ?? c.id}</option>)}
          </select>
        )}
        {!(isSuper && !companyId) && (
          <button className="primary" onClick={regenerate} disabled={busy} style={{ padding: "10px 18px" }}>
            {busy ? "Scanning every conversation…" : "🔄 Run fresh X-Ray"}
          </button>
        )}
        {generatedAt && (
          <span className="subtitle" style={{ margin: 0 }}>
            Last scan: {new Date(generatedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
            {report?.stats && <> · {report.stats.conversations} conversations · {report.stats.leads} leads · {report.stats.days}d</>}
          </span>
        )}
      </div>
      {error && <div className="error" style={{ marginBottom: 16 }}>{error}</div>}

      {/* Every company at once — which business is bleeding, without opening each. */}
      {isSuper && !companyId && (
        across === null ? <div className="empty">Loading every company&apos;s X-Ray…</div>
        : across.length === 0 ? <div className="empty">No X-Ray stored yet. Pick a company above and run the first scan.</div>
        : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 14 }}>
            {across.map((a) => {
              const top = (a.report.objections ?? [])[0];
              const gold = (a.report.gold ?? []).length;
              return (
                <div key={a.companyId} className="card" style={{ padding: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                    <strong style={{ color: "#fff", fontSize: 15 }}>🏢 {a.name}</strong>
                    <button className="link" onClick={() => setCompanyId(a.companyId)}>Open →</button>
                  </div>
                  {a.report.headline && (
                    <div style={{ fontSize: 13.5, color: "var(--text)", marginTop: 8, lineHeight: 1.55 }}>
                      {a.report.headline}
                    </div>
                  )}
                  {top && (
                    <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 10 }}>
                      ☠️ Biggest deal killer: <strong style={{ color: "#fff" }}>{top.label}</strong> ({top.count} leads)
                    </div>
                  )}
                  {gold > 0 && (
                    <div style={{ fontSize: 13, color: "var(--good)", marginTop: 4 }}>
                      💰 {gold} dead {gold === 1 ? "lead" : "leads"} the AI thinks are winnable
                    </div>
                  )}
                  <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 10 }}>
                    Scanned {new Date(a.at).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {!isSuper && !report && !error && <div className="empty">No X-Ray yet — run your first scan above.</div>}
      {isSuper && !!companyId && !report && !error && <div className="empty">No X-Ray for this company yet — run the first scan above.</div>}

      {report && !(isSuper && !companyId) && (
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
