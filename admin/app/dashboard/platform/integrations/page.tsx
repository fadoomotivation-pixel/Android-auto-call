import { createClient } from "@/lib/supabase/server";
import type { Company, CompanyIntegration } from "@/lib/types";
import { IntegrationEditor } from "./IntegrationEditor";

export default async function IntegrationsPage() {
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

  const [{ data: companies }, { data: integ }] = await Promise.all([
    supabase.from("companies").select("id, name").order("created_at").returns<Pick<Company, "id" | "name">[]>(),
    supabase.from("company_integrations").select("*").returns<CompanyIntegration[]>(),
  ]);

  const byId = new Map((integ ?? []).map((i) => [i.company_id, i]));
  const rows = companies ?? [];

  return (
    <>
      <h2>Cloud calling — client integrations</h2>
      <p className="subtitle">
        Assign each client company its own uroperator <strong>token</strong> + <strong>number (DID)</strong>. The token is
        stored securely — only you (super admin) and the calling server can read it; client users never see it.
      </p>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="label">How onboarding works</div>
        <p className="subtitle" style={{ margin: "8px 0 0" }}>
          1. uroperator provisions the client&apos;s tenant + number + `FS_` token. &nbsp;2. Paste them below for that company.
          &nbsp;3. The client&apos;s agents&apos; 📞 Cloud call now routes through their own number.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="empty">No companies yet.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Company</th>
              <th>uroperator token · tenant · number</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const i = byId.get(c.id);
              return (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>
                    <IntegrationEditor
                      companyId={c.id}
                      token={i?.uro_token ?? null}
                      tenantId={i?.uro_tenant_id ?? null}
                      callerId={i?.default_caller_id ?? null}
                    />
                  </td>
                  <td>
                    <span className={`badge ${i?.uro_token ? "connected" : "new"}`}>
                      {i?.uro_token ? "configured" : "not set"}
                    </span>
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
