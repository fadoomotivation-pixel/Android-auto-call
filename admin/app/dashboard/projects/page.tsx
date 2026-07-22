import { createClient } from "@/lib/supabase/server";
import { CompanyPicker } from "../whatsapp/CompanyPicker";

type Interest = {
  id: string;
  project: string;
  stage: string;
  budget: string | null;
  temperature: string | null;
  site_visit_at: string | null;
  created_at: string;
  contacts: { name: string | null; phone: string } | null;
};

const STAGE_LABEL: Record<string, string> = {
  new: "New", interested: "Interested", site_visit: "Site Visit",
  proposal: "Proposal", booked: "Booked", not_interested: "Not interested",
};

function fmtDate(ts: string | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" });
}

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: prof }, { data: pa }] = await Promise.all([
    supabase.from("profiles").select("role, company_id").eq("id", user!.id).maybeSingle<{ role: string; company_id: string | null }>(),
    supabase.from("platform_admins").select("user_id").eq("user_id", user!.id).maybeSingle(),
  ]);
  const isSuper = !!pa;
  if (prof?.role !== "admin" && !isSuper) {
    return <><h2>Buyer Projects</h2><div className="empty">Managers only.</div></>;
  }

  const { data: companies } = isSuper
    ? await supabase.from("companies").select("id, name").order("name").returns<{ id: string; name: string | null }[]>()
    : { data: null };
  const companyId = isSuper ? (sp.company ?? companies?.[0]?.id ?? null) : (prof?.company_id ?? null);

  const { data: interests } = companyId
    ? await supabase.from("lead_project_interests")
        .select("id, project, stage, budget, temperature, site_visit_at, created_at, contacts(name, phone)")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(300)
        .returns<Interest[]>()
    : { data: null };

  const rows = interests ?? [];

  return (
    <>
      <h2>🏢 Buyer Projects</h2>
      <p style={{ color: "var(--muted)", marginTop: -6 }}>
        Which projects each buyer is considering — one lead can be at different stages across several projects.
      </p>
      {isSuper && <CompanyPicker companies={companies ?? []} selected={companyId} />}
      <div className="card">
        {rows.length === 0
          ? <div className="empty">No project interests yet. Reps add them from a lead in the app.</div>
          : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--muted)", fontSize: 12 }}>
                  <th style={{ padding: "6px 4px" }}>Buyer</th>
                  <th style={{ padding: "6px 4px" }}>Project</th>
                  <th style={{ padding: "6px 4px" }}>Stage</th>
                  <th style={{ padding: "6px 4px" }}>Budget</th>
                  <th style={{ padding: "6px 4px" }}>Site visit</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "8px 4px" }}>{r.contacts?.name || r.contacts?.phone || "—"}</td>
                    <td style={{ padding: "8px 4px", fontWeight: 600 }}>{r.project}</td>
                    <td style={{ padding: "8px 4px" }}>{STAGE_LABEL[r.stage] ?? r.stage}</td>
                    <td style={{ padding: "8px 4px" }}>{r.budget || "—"}</td>
                    <td style={{ padding: "8px 4px", color: "var(--muted)" }}>{fmtDate(r.site_visit_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>
    </>
  );
}
