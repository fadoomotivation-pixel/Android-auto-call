import { createClient } from "@/lib/supabase/server";
import type { TelecallerOverview } from "@/lib/types";

export default async function PlatformTelecallersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: pa } = await supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user!.id)
    .maybeSingle();
  if (!pa) return <div className="empty">Not authorized — super admin only.</div>;

  const { data, error } = await supabase
    .from("v_telecaller_overview")
    .select("*")
    .order("calls", { ascending: false })
    .returns<TelecallerOverview[]>();

  const rows = data ?? [];

  return (
    <>
      <h2>Telecallers (all companies)</h2>
      <p className="subtitle">Who is working on what, across every company.</p>

      {error && <div className="error">{error.message}</div>}

      {rows.length === 0 ? (
        <div className="empty">No telecallers yet.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Telecaller</th>
              <th>Company</th>
              <th>Working on</th>
              <th>Campaigns</th>
              <th>Calls</th>
              <th>Connected</th>
              <th>Last call</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.salesperson_id}>
                <td>{t.full_name || "—"}</td>
                <td>{t.company_name || "—"}</td>
                <td>{t.latest_campaign || "—"}</td>
                <td>{t.campaigns}</td>
                <td>{t.calls}</td>
                <td>{t.connected}</td>
                <td>{t.last_call_at ? new Date(t.last_call_at).toLocaleString() : "—"}</td>
                <td>
                  <span className={`badge ${t.is_active ? "connected" : "dnc"}`}>
                    {t.is_active ? "active" : "inactive"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
