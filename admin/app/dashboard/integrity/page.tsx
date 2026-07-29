import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import { IntegrityBoard } from "./IntegrityBoard";

/**
 * Integrity check — the few patterns in a telecaller's own work worth a second
 * look, with the evidence attached.
 *
 * Deliberately not a score and not a ranking: each flag is a question with its
 * innocent explanation printed beside it, because treating these as proof costs
 * more good reps than it catches bad ones.
 *
 * Super admin sees every company, a company admin only their own — enforced
 * inside the rep_integrity SQL function.
 */
export default async function IntegrityPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: me }, { data: pa }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user!.id).maybeSingle<Pick<Profile, "role">>(),
    supabase.from("platform_admins").select("user_id").eq("user_id", user!.id).maybeSingle(),
  ]);
  const isSuper = !!pa;
  if (me?.role !== "admin" && !isSuper) {
    return <><h2>🛡 Integrity check</h2><div className="empty">Managers only.</div></>;
  }

  return (
    <>
      <h2>🛡 Integrity check</h2>
      <p className="subtitle">
        Team ke kaam me jo cheezein poochhne layak hain — saboot ke saath. Har flag ek sawaal hai, ilzaam nahi.
      </p>
      <IntegrityBoard isSuper={isSuper} />
    </>
  );
}
