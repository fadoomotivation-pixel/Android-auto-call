import { createClient } from "@/lib/supabase/server";
import type { Company, CompanyIntegration, Profile } from "@/lib/types";
import { CloudCallingSetup } from "./CloudCallingSetup";

type Member = Pick<Profile, "id" | "full_name" | "sip_agent_id" | "caller_id" | "sip_server" | "sip_port">;

export default async function CloudCallingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id, role")
    .eq("id", user!.id)
    .single<Pick<Profile, "company_id" | "role">>();

  if (profile?.role !== "admin") {
    return <div className="empty">Cloud calling setup is available to company admins only.</div>;
  }
  if (!profile.company_id) {
    return <div className="empty">Your account isn&apos;t linked to a company yet.</div>;
  }

  const [{ data: company }, { data: integ }, { data: members }] = await Promise.all([
    supabase.from("companies").select("id, name").eq("id", profile.company_id).single<Pick<Company, "id" | "name">>(),
    supabase.from("company_integrations").select("*").eq("company_id", profile.company_id).maybeSingle<CompanyIntegration>(),
    supabase
      .from("profiles")
      .select("id, full_name, sip_agent_id, caller_id, sip_server, sip_port")
      .eq("company_id", profile.company_id)
      .eq("role", "salesperson")
      .order("full_name")
      .returns<Member[]>(),
  ]);

  return (
    <>
      <h2>Cloud calling setup</h2>
      <p className="subtitle">
        Connect your UrOperator account, then decide which telecaller uses which extension and number. Your agents&apos;
        📞 Cloud call button uses these automatically — no Android setup required.
      </p>
      <CloudCallingSetup
        companyId={profile.company_id}
        companyName={company?.name ?? "your company"}
        integration={integ ?? null}
        members={members ?? []}
      />
    </>
  );
}
