import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import { LeadManager } from "./LeadManager";

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

  if (profile?.role !== "admin") {
    return <div className="empty">Lead management is available to company admins only.</div>;
  }
  if (!profile.company_id) {
    return <div className="empty">Your account isn&apos;t linked to a company yet.</div>;
  }

  const { data: salespeople } = await supabase
    .from("profiles")
    .select("id, full_name, territory")
    .eq("company_id", profile.company_id)
    .eq("role", "salesperson")
    .order("full_name")
    .returns<{ id: string; full_name: string | null; territory: string | null }[]>();

  return (
    <>
      <h2>Lead Management</h2>
      <p className="subtitle">Upload leads and assign them to your telecallers — they appear instantly in each rep&apos;s app.</p>
      <LeadManager companyId={profile.company_id} salespeople={salespeople ?? []} />
    </>
  );
}
