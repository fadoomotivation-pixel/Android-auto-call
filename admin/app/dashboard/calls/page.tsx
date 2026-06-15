import { createClient } from "@/lib/supabase/server";
import type { CallLog, Profile } from "@/lib/types";

function fmtDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

export default async function CallsPage() {
  const supabase = await createClient();

  const [{ data: calls, error }, { data: people }] = await Promise.all([
    supabase
      .from("call_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500)
      .returns<CallLog[]>(),
    supabase.from("profiles").select("id, full_name").returns<Profile[]>(),
  ]);

  const nameById = new Map((people ?? []).map((p) => [p.id, p.full_name]));
  const rows = calls ?? [];

  return (
    <>
      <h2>Call logs</h2>
      <p className="subtitle">Every call your salespeople have made (latest 500).</p>

      {error && <div className="error">{error.message}</div>}

      {rows.length === 0 ? (
        <div className="empty">No calls logged yet.</div>
      ) : (
        <div className="table-responsive">
<table>
          <thead>
            <tr>
              <th>When</th>
              <th>Salesperson</th>
              <th>Phone</th>
              <th>Outcome</th>
              <th>Duration</th>
              <th>SIM</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td>{c.started_at ? new Date(c.started_at).toLocaleString() : new Date(c.created_at).toLocaleString()}</td>
                <td>{nameById.get(c.salesperson_id) || "—"}</td>
                <td>{c.phone}</td>
                <td>{c.outcome ? <span className={`badge ${c.outcome}`}>{c.outcome}</span> : "—"}</td>
                <td>{fmtDuration(c.duration_seconds)}</td>
                <td>{c.sim_slot ?? "—"}</td>
                <td>{c.notes || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
</div>
      )}
    </>
  );
}

