import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NavLink } from "./NavLink";
import { Sidebar } from "./Sidebar";
import type { Company, Profile } from "@/lib/types";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single<Profile>();

  const { data: pa } = await supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  const isSuper = !!pa;

  let company: Company | null = null;
  if (profile?.company_id) {
    const { data } = await supabase
      .from("companies")
      .select("*")
      .eq("id", profile.company_id)
      .single<Company>();
    company = data;
  }

  return (
    <div className="app">
      <Sidebar 
        profile={profile} 
        company={company} 
        email={user.email} 
        isSuper={isSuper} 
      />
      <main className="main">{children}</main>
    </div>
  );
}
