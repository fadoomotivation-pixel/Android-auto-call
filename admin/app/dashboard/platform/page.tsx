import { createClient } from "@/lib/supabase/server";
import type { CompanyOverview } from "@/lib/types";
import Link from "next/link";
import CompanyRowActions from "./CompanyRowActions";

export default async function PlatformCompaniesPage() {
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
    .from("v_company_overview")
    .select("*")
    .order("calls", { ascending: false })
    .returns<CompanyOverview[]>();

  const rows = data ?? [];
  const totals = rows.reduce(
    (a, r) => ({
      companies: a.companies + 1,
      salespeople: a.salespeople + r.salespeople,
      calls: a.calls + r.calls,
      contacts: a.contacts + r.contacts,
    }),
    { companies: 0, salespeople: 0, calls: 0, contacts: 0 },
  );

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h2 style={{ margin: 0 }}>Companies (all)</h2>
          <p className="subtitle" style={{ margin: "4px 0 0" }}>Platform-wide view of every company and its activity.</p>
        </div>
        <Link href="/dashboard/platform/companies/new" className="badge new" style={{ padding: "8px 16px", textDecoration: "none" }}>
          + New Company
        </Link>
      </div>

      <div className="cards">
        <div className="card"><div className="label">Companies</div><div className="value">{totals.companies}</div></div>
        <div className="card"><div className="label">Salespeople</div><div className="value">{totals.salespeople}</div></div>
        <div className="card"><div className="label">Contacts</div><div className="value">{totals.contacts}</div></div>
        <div className="card"><div className="label">Calls</div><div className="value">{totals.calls}</div></div>
      </div>

      {error && <div className="error">{error.message}</div>}

      {rows.length === 0 ? (
        <div className="empty">No companies yet.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Company</th>
              <th>Salespeople</th>
              <th>Campaigns</th>
              <th>Contacts</th>
              <th>Calls</th>
              <th>Last activity</th>
              <th>Created</th>
              <th style={{ textAlign: "right" }}>Manage</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.company_id}>
                <td>{c.name}</td>
                <td>{c.salespeople}</td>
                <td>{c.campaigns}</td>
                <td>{c.contacts}</td>
                <td>{c.calls}</td>
                <td>{c.last_call_at ? new Date(c.last_call_at).toLocaleString() : "—"}</td>
                <td>{new Date(c.created_at).toLocaleDateString()}</td>
                <td><CompanyRowActions companyId={c.company_id} name={c.name} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
