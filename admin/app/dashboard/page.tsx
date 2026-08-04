import { resolveScope } from "@/lib/dashboard/scope";
import { duration as fmtDuration, compactNum as fmtNum, minutes as fmtMinutes }
  from "@/lib/dashboard/format";
import { ModuleLinks } from "./ModuleLinks";
import { connectRate } from "@/lib/dashboard/metrics";
import { LiveFeed } from "./LiveFeed";
import { ExportCalls } from "./ExportCalls";

type Trend = { d: string; n: number };
type Outcome = { o: string; n: number };
type Leader = { id: string; name: string; calls: number; connected: number };
type Stats = {
  salespeople: number;
  contacts: number;
  calls_total: number;
  talk_14d: number;
  trend: Trend[];
  outcomes: Outcome[];
  leaderboard: Leader[];
};
type SpeedRep = {
  id: string; name: string; leads_7d: number; called_7d: number;
  median_min: number; within_5min: number; breaching_now: number;
};
type Speed = { reps: SpeedRep[]; total_breaching: number };


export default async function OverviewPage({
  searchParams,
}: { searchParams: Promise<{ company?: string }> }) {
  // Everyone lands here after login, reps included — so this is the one module
  // that must never redirect on role.
  const ctx = await resolveScope(await searchParams, { require: "any" });
  const { supabase } = ctx;

  // One aggregated round trip (was: pulling up to 5000 call rows per load).
  // The RPC returns a single jsonb object; supabase-js types rpc as an array,
  // so cast manually rather than via .returns<>() (which rejects non-array T).
  const [{ data: statsRaw }, { data: people }, { data: speedRaw }] = await Promise.all([
    supabase.rpc("get_overview_stats"),
    supabase.from("profiles").select("id, full_name").eq("role", "salesperson"),
    supabase.rpc("get_speed_to_lead"),
  ]);

  const s: Stats = (statsRaw as unknown as Stats | null) ?? {
    salespeople: 0, contacts: 0, calls_total: 0, talk_14d: 0, trend: [], outcomes: [], leaderboard: [],
  };
  const speed: Speed = (speedRaw as unknown as Speed | null) ?? { reps: [], total_breaching: 0 };
  const names: Record<string, string> = Object.fromEntries(
    (people ?? []).map((p: { id: string; full_name: string | null }) => [p.id, p.full_name ?? "—"]),
  );

  const maxDay = Math.max(1, ...s.trend.map((t) => t.n));
  const maxOutcome = Math.max(1, ...s.outcomes.map((o) => o.n));

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Command center</h2>
          <p className="subtitle">A calm, live view of your team&apos;s calling.</p>
        </div>
        <ExportCalls names={names} />
      </div>

      <div className="cards">
        <Stat label="Salespeople" value={fmtNum(s.salespeople)} />
        <Stat label="Contacts" value={fmtNum(s.contacts)} />
        <Stat label="Calls" value={fmtNum(s.calls_total)} />
        <Stat label="Talk time · 14d" value={fmtDuration(s.talk_14d)} />
      </div>

      <LiveFeed names={names} />

      <div className="split-2">
        <div className="card">
          <div className="label">Calls · last 7 days</div>
          <div className="bars">
            {s.trend.map((t) => (
              <div key={t.d} className="bar-col">
                <div className="bar-n">{t.n}</div>
                <div className="bar" style={{ height: `${(t.n / maxDay) * 100}%` }} title={`${t.d}: ${t.n}`} />
                <div className="bar-x">{t.d.slice(5)}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="label">Outcomes · 14 days</div>
          <div className="bars-h">
            {s.outcomes.length === 0 ? (
              <div style={{ color: "var(--muted)" }}>No calls yet.</div>
            ) : (
              s.outcomes.map((o) => (
                <div key={o.o} className="bar-h-row">
                  <div className="bar-h-label"><span className={`badge ${o.o}`}>{o.o}</span></div>
                  <div className="bar-h-track">
                    <div className="bar-h-fill" style={{ width: `${(o.n / maxOutcome) * 100}%` }} />
                  </div>
                  <div className="bar-h-n">{o.n}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* The 5-minute rule: how fast each telecaller jumps on a fresh lead. */}
      <h3 className="section-h">
        Speed to lead · 7 days
        {speed.total_breaching > 0 && (
          <span className="badge dnc" style={{ marginLeft: 10, verticalAlign: "middle" }}>
            🔥 {speed.total_breaching} uncalled right now
          </span>
        )}
      </h3>
      {speed.reps.length === 0 ? (
        <div className="empty">No fresh leads assigned in the last 7 days.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Telecaller</th>
                <th>New leads</th>
                <th>Called</th>
                <th>Median first call</th>
                <th>Within 5 min</th>
                <th>Uncalled now</th>
              </tr>
            </thead>
            <tbody>
              {speed.reps.map((r) => {
                const fast = r.median_min > 0 && r.median_min <= 5;
                return (
                  <tr key={r.id} className="hover-row">
                    <td style={{ color: "#fff", fontWeight: 500 }}>{r.name}</td>
                    <td>{r.leads_7d}</td>
                    <td>{r.called_7d}</td>
                    <td style={{ color: fast ? "var(--good)" : r.median_min > 60 ? "var(--bad)" : "var(--accent)", fontWeight: 600 }}>
                      {fmtMinutes(r.median_min)}
                    </td>
                    <td style={{ color: "var(--good)" }}>{r.within_5min}</td>
                    <td style={{ color: r.breaching_now ? "var(--bad)" : "var(--muted)", fontWeight: r.breaching_now ? 700 : 400 }}>
                      {r.breaching_now || "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="subtitle" style={{ marginTop: 6 }}>
        Leads called within 5 minutes convert several times better. Reps get an automatic
        push when a fresh lead sits uncalled for 10 minutes (escalation at 45).
      </p>

      <h3 className="section-h">Today&apos;s leaderboard · last 24h</h3>
      {s.leaderboard.length === 0 ? (
        <div className="empty">No calls in the last 24 hours.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 48 }}>#</th>
                <th>Telecaller</th>
                <th>Calls</th>
                <th>Connected</th>
                <th>Connect rate</th>
              </tr>
            </thead>
            <tbody>
              {s.leaderboard.map((l, i) => (
                <tr key={l.id} className="hover-row">
                  <td style={{ color: "var(--muted)" }}>{i + 1}</td>
                  <td style={{ color: "#fff", fontWeight: 500 }}>{l.name}</td>
                  <td>{l.calls}</td>
                  <td style={{ color: "var(--good)" }}>{l.connected}</td>
                  <td style={{ color: "var(--accent)" }}>{connectRate(l.connected, l.calls)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ModuleLinks current="overview" scope={ctx} />
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card stat">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  );
}
