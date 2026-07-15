import { createClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import type { CompanyOverview } from "@/lib/types";
import Link from "next/link";
import CompanyRowActions from "./CompanyRowActions";
import CompanyBranding from "./CompanyBranding";
import CompanyLogins, { type CompanyAdmin } from "./CompanyLogins";

type Brand = { id: string; brand_color: string | null; logo_url: string | null; app_channel: string | null };

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

  // Per-company branding + each company's admin logins (service role —
  // super-admin already verified above).
  const svc = getServiceSupabase();
  const [{ data: brandRows }, { data: adminRows }] = await Promise.all([
    svc.from("companies").select("id, brand_color, logo_url, app_channel").returns<Brand[]>(),
    svc.from("profiles").select("id, full_name, company_id").eq("role", "admin").returns<CompanyAdmin[]>(),
  ]);
  const brands = new Map<string, Brand>((brandRows ?? []).map((b) => [b.id, b]));
  const adminsByCompany = new Map<string, CompanyAdmin[]>();
  for (const a of adminRows ?? []) {
    if (!a.company_id) continue;
    const list = adminsByCompany.get(a.company_id) ?? [];
    list.push(a);
    adminsByCompany.set(a.company_id, list);
  }
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
                <td>
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap" }}>
                    <CompanyBranding
                      companyId={c.company_id}
                      name={c.name}
                      brandColor={brands.get(c.company_id)?.brand_color ?? null}
                      logoUrl={brands.get(c.company_id)?.logo_url ?? null}
                      appChannel={brands.get(c.company_id)?.app_channel ?? null}
                    />
                    <CompanyLogins name={c.name} admins={adminsByCompany.get(c.company_id) ?? []} />
                    <CompanyRowActions companyId={c.company_id} name={c.name} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
