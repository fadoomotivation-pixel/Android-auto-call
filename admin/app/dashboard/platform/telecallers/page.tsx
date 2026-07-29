import { createClient } from "@/lib/supabase/server";
import type { TelecallerOverview } from "@/lib/types";
import Link from "next/link";
import { AssignCompany } from "./AssignCompany";
import TelecallerRowActions from "./TelecallerRowActions";
import { SpeaksAsPicker } from "../../salespeople/SpeaksAsPicker";

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

  // speaks_as lives on the profile, not on the overview view, so it is read
  // alongside rather than by widening the view.
  const [{ data, error }, { data: companies }, { data: voices }] = await Promise.all([
    supabase
      .from("v_telecaller_overview")
      .select("*")
      .order("calls", { ascending: false })
      .returns<TelecallerOverview[]>(),
    supabase.from("companies").select("id, name").order("name", { ascending: true }),
    supabase.from("profiles").select("id, speaks_as").returns<{ id: string; speaks_as: string | null }[]>(),
  ]);

  const rows = data ?? [];
  const companyList = companies ?? [];
  const speaksById = new Map((voices ?? []).map((v) => [v.id, v.speaks_as]));

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h2 style={{ margin: 0 }}>Telecallers (all companies)</h2>
          <p className="subtitle" style={{ margin: "4px 0 0" }}>Who is working on what, across every company.</p>
        </div>
        <Link href="/dashboard/platform/telecallers/new" className="badge new" style={{ padding: "8px 16px", textDecoration: "none" }}>
          + New Telecaller
        </Link>
      </div>

      {error && <div className="error">{error.message}</div>}

      {rows.length === 0 ? (
        <div className="empty">No telecallers yet.</div>
      ) : (
        <div className="table-responsive">
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
              <th title='Hindi conjugates the first person, so a message reads "kar rahi hoon" or "kar raha hoon" depending on WHO is writing it.'>Writes as</th>
              <th>Status</th>
              <th style={{ textAlign: "right" }}>Manage</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.salesperson_id}>
                <td>{t.full_name || "—"}</td>
                <td>
                  <AssignCompany
                    userId={t.salesperson_id}
                    name={t.full_name || ""}
                    companyId={t.company_id}
                    companies={companyList}
                  />
                </td>
                <td>{t.latest_campaign || "—"}</td>
                <td>{t.campaigns}</td>
                <td>{t.calls}</td>
                <td>{t.connected}</td>
                <td>{t.last_call_at ? new Date(t.last_call_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "—"}</td>
                <td><SpeaksAsPicker userId={t.salesperson_id} value={speaksById.get(t.salesperson_id) ?? null} /></td>
                <td>
                  <span className={`badge ${t.is_active ? "connected" : "dnc"}`}>
                    {t.is_active ? "active" : "inactive"}
                  </span>
                </td>
                <td><TelecallerRowActions userId={t.salesperson_id} name={t.full_name || "this telecaller"} /></td>
              </tr>
            ))}
          </tbody>
        </table>
</div>
      )}
    </>
  );
}

