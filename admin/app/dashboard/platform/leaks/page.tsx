import { createClient } from "@/lib/supabase/server";

/**
 * Where the leads are dying — the super admin's early warning.
 *
 * WHY THIS IS NOT PLATFORM HQ
 *
 * HQ answers "how busy was each company today". That is an activity report, and
 * activity hides decay: a tenant sitting on 739 leads it has never once dialled
 * looks perfectly healthy on the day it makes twenty calls. This page answers
 * the other question — what is rotting, in which company, and whose fault is it.
 *
 * The two are deliberately separate pages. Folding decay into HQ would bury it
 * under today's numbers, which is exactly where it has been hiding.
 *
 * THREE DISEASES, NEVER ONE SCORE
 *
 * Kept apart because they need different conversations. A company with 739
 * untouched leads has a staffing or routing problem. A company with 182 broken
 * callbacks is calling fine and breaking its promises — the opposite failure,
 * and telling its admin to "call more leads" would be useless advice.
 */

type Leak = {
  company_id: string;
  company_name: string;
  leads_total: number;
  at_risk: number;
  at_risk_pct: number;
  no_owner: number;
  cold: number;
  broken_promises: number;
  telecallers: number;
  silent_reps: number;
  last_call_at: string | null;
  wa_watched: number;
  wa_stale: number;
};

type LeakRep = {
  rep_id: string;
  rep_name: string | null;
  is_active: boolean;
  leads_assigned: number;
  cold: number;
  broken_promises: number;
  calls_7d: number;
  last_call_at: string | null;
  silent: boolean;
  wa_last_seen_at: string | null;
};

const IST = { timeZone: "Asia/Kolkata" } as const;

function ago(iso: string | null): string {
  if (!iso) return "never";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400_000);
  if (d >= 1) return `${d}d ago`;
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3600_000);
  if (h >= 1) return `${h}h ago`;
  return "today";
}

/** Red only when it is genuinely bad, or the colour stops meaning anything. */
function tone(n: number, warn: number, bad: number): string | undefined {
  if (n >= bad) return "#ef4444";
  if (n >= warn) return "#f59e0b";
  return undefined;
}

/** A count that reads as nothing when it is nothing. */
function Num({ n, warn, bad }: { n: number; warn: number; bad: number }) {
  if (n === 0) return <span style={{ opacity: 0.3 }}>—</span>;
  const c = tone(n, warn, bad);
  return <strong style={{ color: c, fontWeight: c ? 700 : 500 }}>{n}</strong>;
}

export default async function LeaksPage({
  searchParams,
}: {
  searchParams: { co?: string };
}) {
  const supabase = await createClient();
  const co = searchParams.co || "";

  const { data: raw, error } = await supabase.rpc("super_leaks", {
    p_cold_days: 7,
    p_silent_days: 3,
  });

  if (error) {
    return (
      <>
        <h2>🩸 Where leads are dying</h2>
        <div className="error">Super admin only. ({error.message})</div>
      </>
    );
  }

  const rows = ((raw ?? []) as Leak[]).filter((r) => r.leads_total > 0);
  const current = co ? rows.find((r) => r.company_id === co) ?? null : null;

  let reps: LeakRep[] = [];
  if (current) {
    const { data } = await supabase.rpc("super_leaks_reps", {
      p_company: current.company_id,
      p_cold_days: 7,
      p_silent_days: 3,
    });
    reps = (data ?? []) as LeakRep[];
  }

  const totalRisk = rows.reduce((s, r) => s + r.at_risk, 0);
  const totalLeads = rows.reduce((s, r) => s + r.leads_total, 0);
  const totalSilent = rows.reduce((s, r) => s + r.silent_reps, 0);
  const totalReps = rows.reduce((s, r) => s + r.telecallers, 0);
  const totalNoOwner = rows.reduce((s, r) => s + r.no_owner, 0);

  // The single sentence this page exists to produce.
  const worst = rows[0];

  if (current) {
    return (
      <>
        <h2>🩸 {current.company_name.trim()}</h2>
        <p className="subtitle">
          <a href="/dashboard/platform/leaks">← All companies</a> ·{" "}
          {current.at_risk} of {current.leads_total} leads going nowhere ({current.at_risk_pct}%)
        </p>

        {reps.length === 0 ? (
          <div className="empty">
            This company has no telecallers. Every one of its {current.leads_total} leads is
            unworked by definition.
          </div>
        ) : (
          <table className="table" style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>Telecaller</th>
                <th style={{ textAlign: "right" }}>Leads</th>
                <th style={{ textAlign: "right" }}>Never called</th>
                <th style={{ textAlign: "right" }}>Broke callback</th>
                <th style={{ textAlign: "right" }}>Calls 7d</th>
                <th>Last call</th>
                <th>WhatsApp</th>
              </tr>
            </thead>
            <tbody>
              {reps.map((r) => (
                <tr key={r.rep_id}>
                  <td>
                    <strong>{r.rep_name || "Telecaller"}</strong>
                    {r.silent && (
                      <div style={{ color: "#ef4444", fontSize: 12, fontWeight: 600 }}>
                        No call in 3 days
                      </div>
                    )}
                    {!r.is_active && (
                      <div className="subtitle" style={{ fontSize: 12 }}>Inactive account</div>
                    )}
                  </td>
                  <td style={{ textAlign: "right" }}>{r.leads_assigned}</td>
                  <td style={{ textAlign: "right" }}><Num n={r.cold} warn={20} bad={100} /></td>
                  <td style={{ textAlign: "right" }}><Num n={r.broken_promises} warn={10} bad={50} /></td>
                  <td style={{ textAlign: "right" }}>
                    {r.calls_7d === 0
                      ? <strong style={{ color: "#ef4444" }}>0</strong>
                      : r.calls_7d}
                  </td>
                  <td className="subtitle" style={{ fontSize: 12.5 }}>{ago(r.last_call_at)}</td>
                  <td className="subtitle" style={{ fontSize: 12.5 }}>
                    {r.wa_last_seen_at === null
                      ? <span style={{ opacity: 0.4 }}>not watched</span>
                      : Date.now() - new Date(r.wa_last_seen_at).getTime() < 2 * 3600_000
                        ? <span style={{ color: "#22c55e" }}>watching</span>
                        : <span style={{ color: "#f59e0b" }}>stale</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <p className="subtitle" style={{ marginTop: 16, fontSize: 12.5 }}>
          <strong>Never called</strong> counts leads assigned to that rep, older than a week, with
          no call ever logged. <strong>Broke callback</strong> counts leads whose promised callback
          time passed over 24 hours ago and was never marked done.
        </p>
        <p className="subtitle" style={{ fontSize: 12.5 }}>
          Open <a href={`/dashboard/platform/hq?co=${current.company_id}`}>Platform HQ</a> to hear
          the actual calls.
        </p>
      </>
    );
  }

  return (
    <>
      <h2>🩸 Where leads are dying</h2>
      <p className="subtitle">
        Every company, ranked by what is rotting right now. <strong>Platform HQ shows how busy
        yesterday was; this shows what is being lost.</strong> A company can make twenty calls
        today and still be sitting on a thousand leads it has never dialled.
      </p>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "12px 0 18px" }}>
        <div className="card" style={{ flex: 1, minWidth: 150, padding: "14px 12px" }}>
          <div style={{ fontSize: 26, fontWeight: 700, color: totalRisk > 0 ? "#ef4444" : undefined }}>
            {totalRisk}
          </div>
          <div className="subtitle" style={{ margin: 0, fontSize: 12 }}>
            leads going nowhere · {Math.round((100 * totalRisk) / Math.max(totalLeads, 1))}% of {totalLeads}
          </div>
        </div>
        <div className="card" style={{ flex: 1, minWidth: 150, padding: "14px 12px" }}>
          <div style={{ fontSize: 26, fontWeight: 700, color: totalSilent > 0 ? "#ef4444" : undefined }}>
            {totalSilent}/{totalReps}
          </div>
          <div className="subtitle" style={{ margin: 0, fontSize: 12 }}>
            telecallers with no call in 3 days
          </div>
        </div>
        <div className="card" style={{ flex: 1, minWidth: 150, padding: "14px 12px" }}>
          <div style={{ fontSize: 26, fontWeight: 700, color: totalNoOwner > 0 ? "#f59e0b" : undefined }}>
            {totalNoOwner}
          </div>
          <div className="subtitle" style={{ margin: 0, fontSize: 12 }}>
            leads with no owner at all
          </div>
        </div>
      </div>

      {worst && worst.at_risk > 0 && (
        <div
          className="card"
          style={{ padding: 14, marginBottom: 16, borderLeft: "3px solid #ef4444" }}
        >
          <strong>Call {worst.company_name.trim()} first.</strong>{" "}
          {worst.at_risk_pct}% of their book ({worst.at_risk} of {worst.leads_total} leads) is going
          nowhere
          {worst.cold > worst.broken_promises
            ? ` — mostly ${worst.cold} leads nobody has ever dialled.`
            : ` — mostly ${worst.broken_promises} callbacks they promised and missed.`}
        </div>
      )}

      <table className="table">
        <thead>
          <tr>
            <th>Company</th>
            <th style={{ textAlign: "right" }}>Going nowhere</th>
            <th style={{ textAlign: "right" }}>No owner</th>
            <th style={{ textAlign: "right" }}>Never called</th>
            <th style={{ textAlign: "right" }}>Broke callback</th>
            <th style={{ textAlign: "right" }}>Silent reps</th>
            <th>Last call</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.company_id}>
              <td>
                <a href={`/dashboard/platform/leaks?co=${r.company_id}`}>
                  <strong>{r.company_name.trim()}</strong>
                </a>
                <div className="subtitle" style={{ fontSize: 12 }}>
                  {r.leads_total} leads · {r.telecallers} telecaller{r.telecallers === 1 ? "" : "s"}
                  {r.wa_watched > 0 && ` · ${r.wa_watched} on WhatsApp${r.wa_stale > 0 ? ` (${r.wa_stale} stale)` : ""}`}
                </div>
              </td>
              <td style={{ textAlign: "right" }}>
                <strong
                  style={{
                    fontSize: 15,
                    color: r.at_risk_pct >= 70 ? "#ef4444" : r.at_risk_pct >= 40 ? "#f59e0b" : undefined,
                  }}
                >
                  {r.at_risk}
                </strong>
                <div className="subtitle" style={{ fontSize: 12 }}>{r.at_risk_pct}%</div>
              </td>
              <td style={{ textAlign: "right" }}><Num n={r.no_owner} warn={20} bad={100} /></td>
              <td style={{ textAlign: "right" }}><Num n={r.cold} warn={30} bad={150} /></td>
              <td style={{ textAlign: "right" }}><Num n={r.broken_promises} warn={20} bad={80} /></td>
              <td style={{ textAlign: "right" }}>
                {r.silent_reps === 0
                  ? <span style={{ opacity: 0.3 }}>—</span>
                  : <strong style={{ color: "#ef4444" }}>{r.silent_reps}/{r.telecallers}</strong>}
              </td>
              <td className="subtitle" style={{ fontSize: 12.5 }}>
                {r.last_call_at
                  ? new Date(r.last_call_at).toLocaleString("en-IN", {
                      ...IST, day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
                    })
                  : "never"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {totalNoOwner > 0 && (
        <div className="card" style={{ padding: 14, marginTop: 18 }}>
          <strong>{totalNoOwner} leads have no owner.</strong> Nobody can call a lead that is
          assigned to nobody, so these can only get older.{" "}
          <a href="/dashboard/routing">Lead Routing</a> is what hands them out — if no rule is
          switched on for a company, its pool never drains.
        </div>
      )}

      <p className="subtitle" style={{ marginTop: 16, fontSize: 12.5 }}>
        <strong>Going nowhere</strong> counts each lead once, however many ways it is failing — a
        lead with no owner is usually also one nobody called, and adding the columns up would
        report more bad leads than the company has.
      </p>
      <p className="subtitle" style={{ fontSize: 12.5 }}>
        <strong>Never called</strong> = older than 7 days with no call ever logged.{" "}
        <strong>Broke callback</strong> = a promised callback time passed over 24 hours ago and was
        never marked done. <strong>Silent reps</strong> = no call logged in 3 days.
      </p>
    </>
  );
}
