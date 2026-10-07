/**
 * Thirty calls to play to a new telecaller on her first day.
 *
 * The founder's ask was literal: "30 best calls I can play to a fresher so she
 * can start her real-estate journey". Everything here follows from that one
 * sentence.
 *
 * It is a LIBRARY, not a leaderboard. /dashboard/coach already shows the best
 * call per rep per day, and that answers "who did well this week". This answers
 * "what should someone who has never sold a plot listen to", which is a
 * different question and gets a different order — a call can be a 2 for the rep
 * who made it and still be the clearest example of a price objection in the
 * database.
 *
 * COMPANY ISOLATION IS NOT NEGOTIABLE HERE. These are real customers talking
 * about real money. A company admin sees their own company's calls; only the
 * super admin sees across tenants, and even then one company at a time is the
 * useful view, so there is a picker. v_training_library is security_invoker and
 * every underlying table carries RLS, so the scope below decides what is SHOWN,
 * not what is permitted.
 */
import { resolveScope, withScope } from "@/lib/dashboard/scope";
import { RecordingPlayer } from "../recordings/RecordingPlayer";
import { ScoreRunner } from "./ScoreRunner";

export const dynamic = "force-dynamic";

type Row = {
  call_id: string;
  company_id: string;
  company_name: string | null;
  rep_name: string | null;
  contact_id: string | null;
  lead_name: string | null;
  stage: string;
  stage_label: string | null;
  started_at: string;
  duration_seconds: number;
  summary: string | null;
  moved_after: boolean;
  score: number | null;
  skill: string | null;
  why: string | null;
  listen_for: string | null;
  coach_rating: number | null;
  score_base: number;
};

const SKILL_LABEL: Record<string, string> = {
  opening: "Opening",
  listening: "Listening",
  objection: "Handling an objection",
  price: "Price talk",
  site_visit: "Booking a visit",
  closing: "Closing",
};

function mmss(s: number) {
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

/** Why this call is in the list, when nothing has read it yet. */
function circumstance(r: Row): string {
  const bits: string[] = [];
  if (r.stage_label) bits.push(`Lead reached ${r.stage_label}`);
  if (r.moved_after) bits.push("the lead moved within two weeks of this call");
  if (r.coach_rating != null) bits.push(`the coach rated this call ${r.coach_rating}/5`);
  bits.push(`${mmss(r.duration_seconds)} of talk`);
  return bits.join(" · ");
}

export default async function TrainingPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; show?: string }>;
}) {
  const sp = await searchParams;
  const scope = await resolveScope(sp, { withCompanies: true });
  const { supabase, isSuper, companyId } = scope;
  const showAll = sp.show === "all";
  const limit = showAll ? 100 : 30;

  let q = supabase
    .from("v_training_library")
    .select(
      "call_id, company_id, company_name, rep_name, contact_id, lead_name, stage, stage_label, started_at, duration_seconds, summary, moved_after, score, skill, why, listen_for, coach_rating, score_base",
    )
    // A call something has actually read beats one ranked by circumstance.
    // nullsFirst:false keeps the unread ones below rather than at the top,
    // which is what "null sorts high in Postgres DESC" would otherwise do.
    .order("score", { ascending: false, nullsFirst: false })
    .order("score_base", { ascending: false })
    .limit(limit);
  if (companyId) q = q.eq("company_id", companyId);

  const { data, error } = await q.returns<Row[]>();
  const rows = data ?? [];
  const unread = rows.filter((r) => r.score == null).length;

  return (
    <>
      <h2>🎧 Calls to learn from</h2>
      <p className="subtitle">
        Real calls from this CRM, best first, for a new telecaller to listen to before she dials.
        Each one says what to listen for.
      </p>

      {isSuper && (
        <div className="company-picker" style={{ margin: "0 0 16px" }}>
          <span className="company-picker-label">Company</span>
          <form method="get">
            <select name="company" defaultValue={companyId ?? ""}>
              <option value="">All companies</option>
              {scope.companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name ?? "Unnamed"}
                </option>
              ))}
            </select>
            <button className="btn-ghost" type="submit" style={{ marginLeft: 8 }}>
              Show
            </button>
          </form>
        </div>
      )}

      {error && <div className="empty">Could not load the library: {error.message}</div>}

      {!error && rows.length === 0 && (
        <div className="empty">
          No call here is long enough or clear enough to teach from yet. A call needs a recording,
          a minute of talk and a readable transcript before it can go in this list.
        </div>
      )}

      {rows.length > 0 && (
        <>
          <ScoreRunner companyId={companyId} unread={unread} />
          {unread === rows.length && (
            <p className="subtitle" style={{ marginTop: -8 }}>
              Nothing here has been read yet, so this order comes from what happened around each
              call — how far the lead got, whether it moved afterwards, how long they talked — not
              from how the call was handled. Press the button above to have each one read.
            </p>
          )}

          <table>
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th>Call</th>
                <th>What to learn</th>
                <th style={{ width: 130 }}>Listen</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.call_id}>
                  <td style={{ color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>{i + 1}</td>
                  <td>
                    <div style={{ fontWeight: 600 }}>
                      {r.contact_id ? (
                        <a href={withScope(`/dashboard/leads/${r.contact_id}`, scope)}>
                          {r.lead_name ?? "Unnamed lead"}
                        </a>
                      ) : (
                        (r.lead_name ?? "Unnamed lead")
                      )}
                    </div>
                    <div className="subtitle" style={{ margin: "2px 0 0" }}>
                      {r.rep_name ?? "Unknown rep"}
                      {isSuper && !companyId && r.company_name ? ` · ${r.company_name}` : ""}
                      {" · "}
                      {mmss(r.duration_seconds)}
                      {" · "}
                      {new Date(r.started_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
                    </div>
                  </td>
                  <td style={{ maxWidth: 460 }}>
                    {r.score != null ? (
                      <>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                          <span className="badge interested">{r.score}/5</span>
                          {r.skill && <span className="badge new">{SKILL_LABEL[r.skill] ?? r.skill}</span>}
                        </div>
                        {r.why && <div>{r.why}</div>}
                        {r.listen_for && (
                          <div className="subtitle" style={{ margin: "4px 0 0" }}>
                            Listen for: {r.listen_for}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="subtitle" style={{ margin: 0 }}>
                        Not read yet — {circumstance(r)}
                      </div>
                    )}
                  </td>
                  <td>
                    <RecordingPlayer callId={r.call_id} canDelete={false} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="subtitle" style={{ marginTop: 14 }}>
            {showAll ? (
              <a href={withScope("/dashboard/training", scope)}>Show the top 30 only</a>
            ) : (
              <a href={withScope("/dashboard/training?show=all", scope)}>Show more than 30</a>
            )}
          </p>
        </>
      )}
    </>
  );
}
