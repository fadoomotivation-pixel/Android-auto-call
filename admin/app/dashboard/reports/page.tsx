import { createClient } from "@/lib/supabase/server";
import { CompanyPicker } from "../whatsapp/CompanyPicker";
import { ReportBuilder } from "./ReportBuilder";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: { company?: string };
}) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // The super admin serves EVERY company equally — never pin them to the
  // company their own profile happens to sit in. They pick via ?company=.
  const [{ data: profile }, { data: pa }] = await Promise.all([
    supabase.from("profiles").select("company_id").eq("id", user.id).maybeSingle<{ company_id: string | null }>(),
    supabase.from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle(),
  ]);
  const isSuper = !!pa;

  const { data: companies } = isSuper
    ? await supabase.from("companies").select("id, name").order("name").returns<{ id: string; name: string | null }[]>()
    : { data: null };
  const companyId = isSuper
    ? (searchParams.company ?? companies?.[0]?.id ?? null)
    : (profile?.company_id ?? null);
  if (!companyId) return <div>No company</div>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <h2>📊 Reports & Exports</h2>
          <p className="subtitle">Generate weekly/monthly performance reports for your team.</p>
        </div>
      </div>

      {isSuper && <CompanyPicker companies={companies ?? []} selected={companyId} />}
      <ReportBuilder key={companyId} companyId={companyId} />
    </div>
  );
}
