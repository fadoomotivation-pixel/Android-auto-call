import { createClient } from "@/lib/supabase/server";
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

function fmtDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
}
function fmtNum(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `${n}`;
}

export default async function OverviewPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // One aggregated round trip (was: pulling up to 5000 call rows per load).
  // The RPC returns a single jsonb object; supabase-js types rpc as an array,
  // so cast manually rather than via .returns<>() (which rejects non-array T).
  const [{ data: statsRaw }, { data: people }] = await Promise.all([
    supabase.rpc("get_overview_stats"),
    supabase.from("profiles").select("id, full_name").eq("role", "salesperson"),
  ]);

  const s: Stats = (statsRaw as unknown as Stats | null) ?? {
    salespeople: 0, contacts: 0, calls_total: 0, talk_14d: 0, trend: [], outcomes: [], leaderboard: [],
  };
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
                  <td style={{ color: "var(--accent)" }}>{l.calls ? Math.round((l.connected / l.calls) * 100) : 0}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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
