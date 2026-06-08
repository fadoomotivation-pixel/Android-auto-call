import { createClient } from "@/lib/supabase/server";
import type { SalespersonStats } from "@/lib/types";

function fmtDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

export default async function SalespeoplePage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_salesperson_stats")
    .select("*")
    .order("total_calls", { ascending: false })
    .returns<SalespersonStats[]>();

  const rows = data ?? [];

  return (
    <>
      <h2>Salespeople</h2>
      <p className="subtitle">Per-person productivity across the team.</p>

      {error && <div className="error">{error.message}</div>}

      {rows.length === 0 ? (
        <div className="empty">No salespeople yet. Invite them from the Android app.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Contacts</th>
              <th>Calls</th>
              <th>Connected</th>
              <th>No answer</th>
              <th>Talk time</th>
              <th>Last call</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.salesperson_id}>
                <td>{r.full_name || "—"}</td>
                <td>{r.total_contacts}</td>
                <td>{r.total_calls}</td>
                <td>{r.connected_calls}</td>
                <td>{r.no_answer_calls}</td>
                <td>{fmtDuration(r.total_talk_seconds)}</td>
                <td>{r.last_call_at ? new Date(r.last_call_at).toLocaleString() : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
