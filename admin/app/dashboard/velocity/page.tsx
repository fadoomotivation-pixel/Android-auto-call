import { resolveScope } from "@/lib/dashboard/scope";
import { ModuleLinks } from "../ModuleLinks";
import { VelocityBoard } from "./VelocityBoard";
import { AutoRescue } from "./AutoRescue";

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
export default async function VelocityPage({
  searchParams,
}: { searchParams: Promise<{ company?: string }> }) {
  // require:"any" — this page answers a rep with a sentence rather than a
  // redirect, which was its behaviour before and is the friendlier one.
  const scope = await resolveScope(await searchParams, { require: "any" });
  const { isSuper } = scope;
  if (scope.role !== "admin" && !isSuper) {
    return <><h2>⚡ Sales Velocity</h2><div className="empty">Managers only.</div></>;
  }

  return (
    <>
      <h2>⚡ Sales Velocity</h2>
      <p className="subtitle">
        <strong>How fast does a lead get its first call?</strong> Every lead you buy has a clock on it.
        This is how fast the team actually picks it up, and what the delay costs you in deals.
      </p>
      <p className="subtitle" style={{ marginTop: -8, fontSize: 12.5 }}>
        This measures the delay. <a href="/dashboard/routing" style={{ color: "var(--accent)" }}>Lead Routing</a> is
        where you change who gets the lead and when.
      </p>
      <VelocityBoard isSuper={isSuper} />
      <div style={{ marginTop: 18 }}>
        <AutoRescue />
      </div>
      <ModuleLinks current="velocity" scope={scope} />
    </>
  );
}
