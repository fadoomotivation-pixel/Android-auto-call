import { createClient } from "@/lib/supabase/server";
import { XrayClient } from "./XrayClient";

export default async function XrayPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: me }, { data: pa }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user!.id).maybeSingle<{ role: string }>(),
    supabase.from("platform_admins").select("user_id").eq("user_id", user!.id).maybeSingle(),
  ]);
  const isSuper = !!pa;
  const isAdmin = me?.role === "admin" || isSuper;

  if (!isAdmin) {
    return (
      <>
        <h2>Sales X-Ray</h2>
        <div className="empty">This page is for managers only.</div>
      </>
    );
  }

  // The super admin serves EVERY company equally — they choose whose X-Ray to
  // read (the sales-xray function already scopes by company_id for them).
  const { data: companies } = isSuper
    ? await supabase.from("companies").select("id, name").order("name").returns<{ id: string; name: string | null }[]>()
    : { data: null };

  return (
    <>
      <h2>🩻 Sales X-Ray</h2>
      <p className="subtitle">
        AI ne aapki saari call conversations ek saath padhi — deals kyun mar rahi hain, buyers kya
        maang rahe hain, jeetne wali calls me kya common tha, aur kaunsi &quot;dead&quot; leads wapas
        jeeti ja sakti hain. Refreshes itself every Monday morning.
      </p>
      <XrayClient isSuper={isSuper} companies={companies ?? []} />
    </>
  );
}
