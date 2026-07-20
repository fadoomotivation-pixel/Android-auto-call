import { createClient } from "@/lib/supabase/server";
import { RecordingPlayer } from "../../recordings/RecordingPlayer";

// Platform HQ — the super admin's whole business on one dashboard page.
// Level 1: every company's live scoreboard for TODAY (IST).
// Level 2 (?co=<id>): that company's telecallers' day + latest calls, with
// recordings playable right here. Data comes from the super_hq* RPCs, which
// are hard-gated server-side on is_super_admin().

type HqCompany = {
  company_id: string; company_name: string; telecallers: number;
  leads_total: number; leads_new: number;
  calls_today: number; connected_today: number; talk_today: number;
  recordings_today: number; last_call_at: string | null;
};
type HqRep = {
  rep_id: string; rep_name: string | null; rep_phone: string | null; is_active: boolean;
  leads_assigned: number; calls_today: number; connected_today: number;
  talk_today: number; recordings_today: number; last_call_at: string | null;
};
type HqCall = {
  call_id: string; rep_name: string | null; lead_name: string | null; phone: string | null;
  direction: string | null; outcome: string | null; duration_seconds: number;
  recording_status: string | null; off_crm: boolean; summary: string | null;
  started_at: string | null;
};
type HqFunnel = { leads_total: number; contacted: number; interested: number; site_visit: number; booked: number };
type HqTrend = { rep_id: string; day: string; calls: number };

function fmtTalk(seconds: number) {
  if (seconds >= 3600) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  if (seconds >= 60) return `${Math.floor(seconds / 60)}m`;
  return `${seconds}s`;
}

// Cumulative lead funnel: total → contacted → interested → site-visit → booked,
// with each step's conversion off the previous.
function Funnel({ f }: { f: HqFunnel }) {
  const stages = [
    { label: "Leads", value: f.leads_total, color: "#64748b" },
    { label: "Contacted", value: f.contacted, color: "#4353B8" },
    { label: "Interested", value: f.interested, color: "#8b5cf6" },
    { label: "Site visit", value: f.site_visit, color: "#f59e0b" },
    { label: "Booked", value: f.booked, color: "#22c55e" },
  ];
  const total = Math.max(1, f.leads_total);
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {stages.map((s, i) => {
          const pct = Math.round((s.value / total) * 100);
          const prev = i > 0 ? stages[i - 1].value : s.value;
          const conv = prev > 0 ? Math.round((s.value / prev) * 100) : 0;
          return (
            <div key={s.label}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 3 }}>
                <span>{s.label}{i > 0 && <span style={{ opacity: 0.55 }}> · {conv}% of prev</span>}</span>
                <strong>{s.value} <span style={{ opacity: 0.6, fontWeight: 400 }}>({pct}%)</span></strong>
              </div>
              <div style={{ height: 8, borderRadius: 4, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                <div style={{ width: `${Math.max(pct, 1.5)}%`, height: "100%", borderRadius: 4, background: s.color }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Tiny inline sparkline (no client JS — this is a server component).
function Sparkline({ values }: { values: number[] }) {
  const w = 84, h = 22, n = values.length;
  const max = Math.max(1, ...values);
  const x = (i: number) => (n <= 1 ? 0 : (i / (n - 1)) * w);
  const y = (v: number) => h - (v / max) * (h - 2) - 1;
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <svg width={w} height={h} style={{ display: "block" }} aria-hidden>
      <polyline points={pts} fill="none" stroke="#4353B8" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(n - 1)} cy={y(values[n - 1] ?? 0)} r={2} fill="#4353B8" />
    </svg>
  );
}

// The last 7 IST day-keys (oldest → newest), for aligning the trend rows.
function last7IstDays(): string[] {
  const out: string[] = [];
  for (let i = 6; i >= 0; i--) {
    out.push(new Date(Date.now() + 5.5 * 3600 * 1000 - i * 86400000).toISOString().slice(0, 10));
  }
  return out;
}

const RANGES = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "all", label: "All time" },
] as const;

export default async function PlatformHqPage({
  searchParams,
}: {
  searchParams: { co?: string; range?: string };
}) {
  const supabase = await createClient();
  const co = searchParams.co || "";
  const range = RANGES.some((r) => r.key === searchParams.range) ? searchParams.range! : "today";
  const rangeLabel = RANGES.find((r) => r.key === range)!.label.toLowerCase();
  const qs = (o: { co?: string; range?: string }) => {
    const p = new URLSearchParams();
    if (o.co) p.set("co", o.co);
    if (o.range && o.range !== "today") p.set("range", o.range);
    const s = p.toString();
    return s ? `?${s}` : "";
  };

  const { data: companiesRaw, error } = await supabase.rpc("super_hq", { p_range: range });
  if (error) {
    return (
      <>
        <h2>🛰 Platform HQ</h2>
        <div className="error">Super admin only. ({error.message})</div>
      </>
    );
  }
  const rows = (companiesRaw ?? []) as HqCompany[];
  const current = co ? rows.find((c) => c.company_id === co) ?? null : null;

  // Conversion funnel — for the drilled-in company, else the whole platform.
  const { data: funnelRaw } = await supabase.rpc("super_hq_funnel", { p_company: current?.company_id ?? null });
  const funnel = (Array.isArray(funnelRaw) ? funnelRaw[0] : null) as HqFunnel | null;

  let reps: HqRep[] = [];
  let calls: HqCall[] = [];
  const trendMap: Record<string, number[]> = {};
  const istDays = last7IstDays();
  if (current) {
    const [r1, r2, r3] = await Promise.all([
      supabase.rpc("super_hq_reps", { p_company: current.company_id, p_range: range }),
      supabase.rpc("super_hq_calls", { p_company: current.company_id, p_limit: 40 }),
      supabase.rpc("super_hq_rep_trend", { p_company: current.company_id, p_days: 7 }),
    ]);
    reps = (r1.data ?? []) as HqRep[];
    calls = (r2.data ?? []) as HqCall[];
    for (const rep of reps) trendMap[rep.rep_id] = istDays.map(() => 0);
    for (const t of (r3.data ?? []) as HqTrend[]) {
      const idx = istDays.indexOf(t.day);
      if (idx >= 0 && trendMap[t.rep_id]) trendMap[t.rep_id][idx] = t.calls;
    }
  }

  const stat = (v: string | number, label: string) => (
    <div className="card" style={{ flex: 1, minWidth: 120, textAlign: "center", padding: "14px 8px" }}>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{v}</div>
      <div className="subtitle" style={{ margin: 0, fontSize: 12 }}>{label}</div>
    </div>
  );

  return (
    <>
      <h2>🛰 Platform HQ {current ? `· ${current.company_name.trim()}` : ""}</h2>
      <p className="subtitle">
        {current
          ? <><a href={`/dashboard/platform/hq${qs({ range })}`}>← All companies</a> · {rangeLabel} work and latest calls</>
          : `Your whole business, live — ${rangeLabel} across every company. Click a company to drill in.`}
      </p>

      {/* Time-range picker — so the board is never blank on a fresh day. */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "4px 0 12px" }}>
        {RANGES.map((r) => (
          <a
            key={r.key}
            href={`/dashboard/platform/hq${qs({ co, range: r.key })}`}
            className="card"
            style={{
              padding: "6px 14px", textDecoration: "none",
              fontWeight: r.key === range ? 700 : 400,
              color: r.key === range ? "#fff" : "inherit",
              background: r.key === range ? "var(--accent, #4353B8)" : undefined,
            }}
          >
            {r.label}
          </a>
        ))}
      </div>

      {!current && (
        <>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "12px 0 18px" }}>
            {stat(rows.reduce((a, c) => a + c.calls_today, 0), `Calls ${rangeLabel}`)}
            {stat(rows.reduce((a, c) => a + c.connected_today, 0), "Connected")}
            {stat(rows.reduce((a, c) => a + c.recordings_today, 0), "Recordings")}
            {stat(fmtTalk(rows.reduce((a, c) => a + c.talk_today, 0)), "Talk time")}
          </div>

          {funnel && funnel.leads_total > 0 && (
            <>
              <h3 style={{ margin: "6px 0 8px" }}>Conversion funnel · all companies</h3>
              <div style={{ marginBottom: 18 }}><Funnel f={funnel} /></div>
            </>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
            {rows.map((c) => (
              <a
                key={c.company_id}
                href={`/dashboard/platform/hq${qs({ co: c.company_id, range })}`}
                className="card"
                style={{ textDecoration: "none", color: "inherit", display: "block" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <strong style={{ flex: 1, fontSize: 16 }}>{c.company_name.trim()}</strong>
                  {c.calls_today === 0 && c.telecallers > 0 && (
                    <span style={{ color: "#B8860B", fontSize: 13 }}>😴 idle</span>
                  )}
                </div>
                <div className="subtitle" style={{ margin: "2px 0 10px", fontSize: 13 }}>
                  {c.telecallers} telecallers · {c.leads_total} leads ({c.leads_new} new)
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                  <span><strong>{c.calls_today}</strong> calls</span>
                  <span><strong>{c.connected_today}</strong> connected</span>
                  <span><strong>{fmtTalk(c.talk_today)}</strong> talk</span>
                  <span><strong>{c.recordings_today}</strong> 🎙</span>
                </div>
              </a>
            ))}
          </div>
          {rows.length === 0 && <div className="empty">No companies yet.</div>}
        </>
      )}

      {current && (
        <>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "12px 0 18px" }}>
            {stat(current.calls_today, `Calls ${rangeLabel}`)}
            {stat(current.connected_today, "Connected")}
            {stat(current.recordings_today, "Recordings")}
            {stat(fmtTalk(current.talk_today), "Talk time")}
          </div>

          {funnel && funnel.leads_total > 0 && (
            <>
              <h3 style={{ margin: "6px 0 8px" }}>Conversion funnel</h3>
              <div style={{ marginBottom: 18 }}><Funnel f={funnel} /></div>
            </>
          )}

          <h3 style={{ margin: "6px 0 8px" }}>Team · {rangeLabel}</h3>
          <div className="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>Telecaller</th><th>Leads</th><th>Calls</th><th>Connected</th>
                  <th>Talk</th><th>Rec 🎙</th><th>7-day calls</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {reps.map((r) => {
                  const trend = trendMap[r.rep_id] ?? [];
                  const trend7 = trend.reduce((a, b) => a + b, 0);
                  return (
                  <tr key={r.rep_id}>
                    <td><strong>{r.rep_name ?? "—"}</strong>{r.rep_phone ? <div style={{ fontSize: 12, opacity: 0.6 }}>{r.rep_phone}</div> : null}</td>
                    <td>{r.leads_assigned}</td>
                    <td>{r.calls_today}</td>
                    <td>{r.connected_today}</td>
                    <td>{fmtTalk(r.talk_today)}</td>
                    <td>{r.recordings_today}</td>
                    <td>
                      {trend7 > 0
                        ? <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Sparkline values={trend} /><span style={{ fontSize: 12, opacity: 0.7 }}>{trend7}</span></div>
                        : <span style={{ fontSize: 12, opacity: 0.5 }}>—</span>}
                    </td>
                    <td>
                      {!r.is_active ? <span style={{ color: "var(--danger, #C0452C)" }}>inactive</span>
                        : r.calls_today === 0 ? <span style={{ color: "#B8860B" }}>😴 no calls yet</span>
                        : <span style={{ color: "var(--accent, #4353B8)" }}>working</span>}
                    </td>
                  </tr>
                  );
                })}
                {reps.length === 0 && <tr><td colSpan={8}>No telecallers in this company yet.</td></tr>}
              </tbody>
            </table>
          </div>

          <h3 style={{ margin: "18px 0 8px" }}>Latest calls</h3>
          <div className="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>When</th><th>Telecaller</th><th>Lead</th><th>Dir</th>
                  <th>Length</th><th>Recording</th><th>AI summary</th>
                </tr>
              </thead>
              <tbody>
                {calls.map((c) => (
                  <tr key={c.call_id}>
                    <td>{c.started_at ? new Date(c.started_at).toLocaleString() : "—"}</td>
                    <td>{c.rep_name ?? "—"}</td>
                    <td>
                      {c.off_crm
                        ? <span style={{ color: "var(--danger, #C0452C)", fontWeight: 600 }}>⚠ Off-CRM number</span>
                        : <strong>{c.lead_name ?? "Unknown"}</strong>}
                      <div style={{ fontSize: 12, opacity: 0.7 }}>{c.phone}</div>
                    </td>
                    <td>{c.direction === "incoming" ? "↙ In" : "↗ Out"}</td>
                    <td>{fmtTalk(c.duration_seconds)}</td>
                    <td>{c.recording_status === "ready" ? <RecordingPlayer callId={c.call_id} canDelete={true} /> : "—"}</td>
                    <td style={{ maxWidth: 320, fontSize: 13 }}>{c.summary ?? "—"}</td>
                  </tr>
                ))}
                {calls.length === 0 && <tr><td colSpan={7}>No calls logged yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
