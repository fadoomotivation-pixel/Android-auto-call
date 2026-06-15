import { createClient } from "@/lib/supabase/server";
import { ReportBuilder } from "./ReportBuilder";

export default async function ReportsPage() {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase.from("profiles").select("company_id").eq("id", user.id).single();
  if (!profile?.company_id) return <div>No company</div>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <h2>📊 Reports & Exports</h2>
          <p className="subtitle">Generate weekly/monthly performance reports for your team.</p>
        </div>
      </div>
      
      <ReportBuilder companyId={profile.company_id} />
    </div>
  );
}
