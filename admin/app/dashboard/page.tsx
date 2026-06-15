import { createClient } from "@/lib/supabase/server";
import { LiveFeed } from "./LiveFeed";
import { ExportCalls } from "./ExportCalls";

interface RecentCall {
  id: string;
  phone: string;
  outcome: string | null;
  salesperson_id: string;
  duration_seconds: number;
  created_at: string;
}

function fmtDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
}

export default async function OverviewPage() {
  const supabase = await createClient();
  const since14 = new Date(Date.now() - 14 * 86400000).toISOString();

  const [{ count: contactCount }, { count: callCount }, { count: salesCount }, { data: recent }, { data: people }] =
    await Promise.all([
      supabase.from("contacts").select("*", { count: "exact", head: true }),
      supabase.from("call_logs").select("*", { count: "exact", head: true }),
      supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "salesperson"),
      supabase
        .from("call_logs")
        .select("id,phone,outcome,salesperson_id,duration_seconds,created_at")
        .gte("created_at", since14)
        .order("created_at", { ascending: false })
        .limit(5000)
        .returns<RecentCall[]>(),
      supabase.from("profiles").select("id, full_name"),
    ]);

  const calls = recent ?? [];
  const names: Record<string, string> = Object.fromEntries(
    (people ?? []).map((p: { id: string; full_name: string | null }) => [p.id, p.full_name ?? "—"]),
  );

  const totalTalk = calls.reduce((s, c) => s + (c.duration_seconds || 0), 0);

  // 7-day trend
  const dayKeys: string[] = [];
  for (let i = 6; i >= 0; i--) {
    dayKeys.push(new Date(Date.now() - i * 86400000).toISOString().slice(0, 10));
  }
  const perDay: Record<string, number> = Object.fromEntries(dayKeys.map((d) => [d, 0]));
  for (const c of calls) {
    const d = c.created_at.slice(0, 10);
    if (d in perDay) perDay[d]++;
  }
  const maxDay = Math.max(1, ...dayKeys.map((d) => perDay[d]));

  // outcome breakdown
  const outcomes: Record<string, number> = {};
  for (const c of calls) {
    const o = c.outcome || "unknown";
    outcomes[o] = (outcomes[o] || 0) + 1;
  }
  const outcomeEntries = Object.entries(outcomes).sort((a, b) => b[1] - a[1]);
  const maxOutcome = Math.max(1, ...outcomeEntries.map(([, n]) => n));

  // last-24h leaderboard
  const since24 = Date.now() - 86400000;
  const board: Record<string, { calls: number; connected: number }> = {};
  for (const c of calls) {
    if (new Date(c.created_at).getTime() < since24) continue;
    const b = (board[c.salesperson_id] ??= { calls: 0, connected: 0 });
    b.calls++;
    if (c.outcome === "connected") b.connected++;
  }
  const leaders = Object.entries(board)
    .map(([id, b]) => ({ id, name: names[id] || "—", ...b }))
    .sort((a, b) => b.calls - a.calls)
    .slice(0, 8);

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h2>Command center</h2>
          <p className="subtitle">Live view of your team&apos;s calling activity.</p>
        </div>
        <ExportCalls names={names} />
      </div>

      <div className="cards">
        <div className="card"><div className="label">Salespeople</div><div className="value">{salesCount ?? 0}</div></div>
        <div className="card"><div className="label">Contacts</div><div className="value">{contactCount ?? 0}</div></div>
        <div className="card"><div className="label">Calls (total)</div><div className="value">{callCount ?? 0}</div></div>
        <div className="card"><div className="label">Talk time (14d)</div><div className="value">{fmtDuration(totalTalk)}</div></div>
      </div>

      <LiveFeed names={names} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 28 }}>
        <div className="card">
          <div className="label">Calls — last 7 days</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 140, marginTop: 16 }}>
            {dayKeys.map((d) => (
              <div key={d} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>{perDay[d]}</div>
                <div
                  title={`${d}: ${perDay[d]}`}
                  style={{
                    width: "100%",
                    height: `${(perDay[d] / maxDay) * 100}%`,
                    minHeight: 3,
                    background: "var(--accent)",
                    borderRadius: 6,
                  }}
                />
                <div style={{ fontSize: 10, color: "var(--muted)" }}>{d.slice(5)}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="label">Outcomes (14 days)</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
            {outcomeEntries.length === 0 ? (
              <div style={{ color: "var(--muted)" }}>No calls yet.</div>
            ) : (
              outcomeEntries.map(([o, n]) => (
                <div key={o} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 92, fontSize: 12 }}>
                    <span className={`badge ${o}`}>{o}</span>
                  </div>
                  <div style={{ flex: 1, background: "var(--panel-2)", borderRadius: 6, overflow: "hidden" }}>
                    <div style={{ width: `${(n / maxOutcome) * 100}%`, background: "var(--accent)", height: 16 }} />
                  </div>
                  <div style={{ width: 36, textAlign: "right", fontSize: 13 }}>{n}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <h3 style={{ margin: "0 0 12px" }}>Today&apos;s leaderboard (last 24h)</h3>
      {leaders.length === 0 ? (
        <div className="empty">No calls in the last 24 hours.</div>
      ) : (
        <div className="table-responsive">
<table>
          <thead>
            <tr><th>#</th><th>Telecaller</th><th>Calls</th><th>Connected</th><th>Connect rate</th></tr>
          </thead>
          <tbody>
            {leaders.map((l, i) => (
              <tr key={l.id}>
                <td>{i + 1}</td>
                <td>{l.name}</td>
                <td>{l.calls}</td>
                <td>{l.connected}</td>
                <td>{l.calls ? Math.round((l.connected / l.calls) * 100) : 0}%</td>
              </tr>
            ))}
          </tbody>
        </table>
</div>
      )}
    </>
  );
}

