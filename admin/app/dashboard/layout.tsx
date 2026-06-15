import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NavLink } from "./NavLink";
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
      <aside className="sidebar">
        <h1>📞 SalesAutoCall</h1>
        <NavLink href="/dashboard" label="Overview" />
        {(profile?.role === "admin" || isSuper) && <NavLink href="/dashboard/coach" label="🤖 AI Coach" />}
        <NavLink href="/dashboard/salespeople" label="Salespeople" />
        {profile?.role === "admin" && <NavLink href="/dashboard/leads" label="🎯 Lead Management" />}
        {profile?.role === "admin" && <NavLink href="/dashboard/cloud-calling" label="☁️ Cloud calling" />}
        <NavLink href="/dashboard/contacts" label="Contacts" />
        <NavLink href="/dashboard/calls" label="Call logs" />
        <NavLink href="/dashboard/recordings" label="Recordings" />
        {isSuper && (
          <>
            <div style={{ margin: "14px 6px 4px", fontSize: 11, letterSpacing: "0.08em", color: "var(--muted)", textTransform: "uppercase" }}>
              Super admin
            </div>
            <NavLink href="/dashboard/platform" label="🏢 Companies" />
            <NavLink href="/dashboard/platform/telecallers" label="🎧 Telecallers" />
            <NavLink href="/dashboard/platform/contacts" label="📇 Contacts" />
            <NavLink href="/dashboard/platform/integrations" label="☎️ Integrations" />
            <NavLink href="/dashboard/platform/storage" label="💾 Recording storage" />
          </>
        )}
        <div className="spacer" />
        <div style={{ padding: "0 6px 10px", color: "var(--muted)", fontSize: 12 }}>
          <div style={{ color: "var(--text)", fontWeight: 600 }}>
            {company?.name ?? "No company"}
          </div>
          <div>{profile?.full_name ?? user.email}</div>
        </div>
        <form action="/auth/signout" method="post">
          <button className="link" type="submit">
            Sign out
          </button>
        </form>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
