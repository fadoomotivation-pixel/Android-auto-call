import { createClient } from "@/lib/supabase/server";
import type { Company, Profile, SalespersonStats } from "@/lib/types";
import { InviteCard } from "./InviteCard";
import { MemberToggle } from "./MemberToggle";

function fmtDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

export default async function SalespeoplePage() {
  const supabase = await createClient();

  const [{ data: stats, error }, { data: company }, { data: members }] = await Promise.all([
    supabase
      .from("v_salesperson_stats")
      .select("*")
      .order("total_calls", { ascending: false })
      .returns<SalespersonStats[]>(),
    supabase.from("companies").select("*").limit(1).maybeSingle<Company>(),
    supabase
      .from("profiles")
      .select("id, full_name, is_active")
      .eq("role", "salesperson")
      .returns<Pick<Profile, "id" | "full_name" | "is_active">[]>(),
  ]);

  const rows = stats ?? [];
  const activeById = new Map((members ?? []).map((m) => [m.id, m.is_active]));

  return (
    <>
      <h2>Salespeople</h2>
      <p className="subtitle">Invite your team and track per-person productivity.</p>

      <InviteCard code={company?.join_code ?? null} />

      {error && <div className="error">{error.message}</div>}

      {rows.length === 0 ? (
        <div className="empty">No salespeople yet. Share the invite code above.</div>
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
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const active = activeById.get(r.salesperson_id) ?? true;
              return (
                <tr key={r.salesperson_id}>
                  <td>{r.full_name || "—"}</td>
                  <td>{r.total_contacts}</td>
                  <td>{r.total_calls}</td>
                  <td>{r.connected_calls}</td>
                  <td>{r.no_answer_calls}</td>
                  <td>{fmtDuration(r.total_talk_seconds)}</td>
                  <td>{r.last_call_at ? new Date(r.last_call_at).toLocaleString() : "—"}</td>
                  <td>
                    <span className={`badge ${active ? "connected" : "dnc"}`} style={{ marginRight: 8 }}>
                      {active ? "active" : "inactive"}
                    </span>
                    <MemberToggle userId={r.salesperson_id} active={active} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}
