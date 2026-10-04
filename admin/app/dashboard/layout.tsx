import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Chrome } from "./Chrome";
import { CaptureOutageBanner } from "./CaptureOutageBanner";
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
    <Chrome profile={profile} company={company} email={user.email} isSuper={isSuper}>
      {(profile?.role === "admin" || isSuper) && <CaptureOutageBanner />}
      {children}
    </Chrome>
  );
}
