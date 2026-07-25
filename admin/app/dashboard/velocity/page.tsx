import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import { VelocityBoard } from "./VelocityBoard";

/**
 * Sales Velocity — the Revenue Leak Radar.
 *
 * Speed-to-lead is the single biggest lever between ad spend and a sale, and
 * nothing here measured it. This page shows how long leads wait for their first
 * call, proves with the owner's own numbers how much conversion that costs, and
 * names the leads that were paid for but never called.
 *
 * Super admin sees every company (and a per-company table); a company admin sees
 * only their own team — enforced inside the lead_velocity SQL function.
 */
export default async function VelocityPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: me }, { data: pa }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user!.id).maybeSingle<Pick<Profile, "role">>(),
    supabase.from("platform_admins").select("user_id").eq("user_id", user!.id).maybeSingle(),
  ]);
  const isSuper = !!pa;
  if (me?.role !== "admin" && !isSuper) {
    return <><h2>⚡ Sales Velocity</h2><div className="empty">Managers only.</div></>;
  }

  return (
    <>
      <h2>⚡ Sales Velocity</h2>
      <p className="subtitle">
        Every lead you buy has a clock on it. This is how fast your team actually picks it up — and
        what the delay is costing you in deals.
      </p>
      <VelocityBoard isSuper={isSuper} />
    </>
  );
}
