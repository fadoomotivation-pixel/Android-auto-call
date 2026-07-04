import { createClient } from "@/lib/supabase/server";
import { PulseClient } from "./PulseClient";

export default async function PulsePage() {
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
        <h2>Daily Pulse</h2>
        <div className="empty">This page is for managers only.</div>
      </>
    );
  }

  return (
    <>
      <h2>🔔 Daily Pulse</h2>
      <p className="subtitle">
        Aaj kiski pipeline me kya hua — har telecaller ka din ek nazar me, AI ke shabdon me. Calls,
        voice notes, aur lead movements se auto-banta hai. Owner ko forward karne layak.
      </p>
      <PulseClient isSuper={isSuper} />
    </>
  );
}
