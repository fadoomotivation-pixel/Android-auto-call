import { createClient } from "@/lib/supabase/server";
import type { ContactDetail } from "@/lib/types";
import { PlatformContacts, type LiteCompany, type LiteSalesperson } from "./PlatformContacts";

export default async function PlatformContactsPage() {
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

  const [contactsRes, companiesRes, peopleRes] = await Promise.all([
    supabase
      .from("v_contact_details")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1000)
      .returns<ContactDetail[]>(),
    supabase
      .from("companies")
      .select("id,name")
      .order("name")
      .returns<LiteCompany[]>(),
    supabase
      .from("profiles")
      .select("id,full_name,company_id")
      .eq("role", "salesperson")
      .order("full_name")
      .returns<LiteSalesperson[]>(),
  ]);

  return (
    <>
      <h2>Contacts (all companies)</h2>
      <p className="subtitle">
        Every contact across the platform. Select leads to reassign them to a company or employee, or add new leads below.
      </p>

      {contactsRes.error && <div className="error">{contactsRes.error.message}</div>}

      <PlatformContacts
        rows={contactsRes.data ?? []}
        companies={companiesRes.data ?? []}
        salespeople={peopleRes.data ?? []}
      />
    </>
  );
}
