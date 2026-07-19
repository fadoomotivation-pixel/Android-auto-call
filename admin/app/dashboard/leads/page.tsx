import { createClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import type { Profile } from "@/lib/types";
import { LeadManager } from "./LeadManager";

type Sp = { id: string; full_name: string | null; territory: string | null; company_id: string | null; company_name?: string | null };

export default async function LeadsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id, role")
    .eq("id", user!.id)
    .single<Pick<Profile, "company_id" | "role">>();

  // Is this account the platform (super) admin? Only then may they see and
  // assign to telecallers OUTSIDE their own company — a regular company admin
  // must stay strictly scoped to their own team (company isolation).
  const { data: pa } = await supabase
    .from("platform_admins").select("user_id").eq("user_id", user!.id).maybeSingle();
  const isSuper = !!pa;

  if (profile?.role !== "admin" && !isSuper) {
    return <div className="empty">Lead management is available to company admins only.</div>;
  }
  if (!profile?.company_id) {
    return <div className="empty">Your account isn&apos;t linked to a company yet.</div>;
  }

  let salespeople: Sp[] = [];
  if (isSuper) {
    // Service role bypasses per-company RLS so the super admin sees every
    // company's telecallers, each labelled with its company.
    const svc = getServiceSupabase();
    const { data: reps } = await svc
      .from("profiles")
      .select("id, full_name, territory, company_id, companies(name)")
      .eq("role", "salesperson")
      .order("full_name");
    salespeople = (reps ?? []).map((r) => {
      const rec = r as { id: string; full_name: string | null; territory: string | null; company_id: string | null; companies?: { name?: string | null } | null };
      return { id: rec.id, full_name: rec.full_name, territory: rec.territory, company_id: rec.company_id, company_name: rec.companies?.name ?? null };
    });
  } else {
    const { data: reps } = await supabase
      .from("profiles")
      .select("id, full_name, territory, company_id")
      .eq("company_id", profile.company_id)
      .eq("role", "salesperson")
      .order("full_name")
      .returns<Sp[]>();
    salespeople = reps ?? [];
  }

  return (
    <>
      <h2>Lead Management</h2>
      <p className="subtitle">Upload leads and assign them to your telecallers — they appear instantly in each rep&apos;s app.</p>
      <LeadManager companyId={profile.company_id} salespeople={salespeople} isSuper={isSuper} />
    </>
  );
}
