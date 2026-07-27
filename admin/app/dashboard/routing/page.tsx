import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import { RoutingBoard } from "./RoutingBoard";

/**
 * Lead Routing — who gets the next lead, and when.
 *
 * A lead that lands at 3 a.m. shouldn't sit on a sleeping rep's phone until
 * lunch. It waits in the pool and moves the moment someone starts their shift
 * at the office — one lead each, in turn, skipping anyone already holding a pile
 * of untouched ones.
 *
 * Every rule is off until switched on here, per company. Super admin sets it for
 * any company; a company admin only for their own — enforced inside the
 * routing_board / assign_pool SQL functions and the table's RLS.
 */
export default async function RoutingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: me }, { data: pa }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user!.id).maybeSingle<Pick<Profile, "role">>(),
    supabase.from("platform_admins").select("user_id").eq("user_id", user!.id).maybeSingle(),
  ]);
  const isSuper = !!pa;
  if (me?.role !== "admin" && !isSuper) {
    return <><h2>🎯 Lead Routing</h2><div className="empty">Managers only.</div></>;
  }

  return (
    <>
      <h2>🎯 Lead Routing</h2>
      <p className="subtitle">
        Lead tabhi jaaye jab telecaller office se check-in kar le — ek lead ek banda, bari-bari. Jiske paas
        pehle se bahut si bina chhui leads padi hon, uska number skip ho jaaye.
      </p>
      <RoutingBoard isSuper={isSuper} />
    </>
  );
}
