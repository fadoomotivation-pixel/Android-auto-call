import { resolveScope } from "@/lib/dashboard/scope";
import { ModuleLinks } from "../ModuleLinks";
import { XrayClient } from "./XrayClient";

export default async function XrayPage({
  searchParams,
}: { searchParams: Promise<{ company?: string }> }) {
  const scope = await resolveScope(await searchParams, { require: "any" });
  const { supabase, isSuper } = scope;
  const isAdmin = scope.role === "admin" || isSuper;

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
        <strong>Why deals die.</strong> AI reads every conversation together and finds the patterns —
        what kills deals, what buyers keep asking for, what the winning calls had in common, and which
        &quot;dead&quot; leads are still winnable. Refreshes every Monday.
      </p>
      <p className="subtitle" style={{ marginTop: -8, fontSize: 12.5 }}>
        For one day&apos;s work per rep see <a href="/dashboard/pulse" style={{ color: "var(--accent)" }}>Daily Pulse</a>;
        for how fast leads get called see <a href="/dashboard/velocity" style={{ color: "var(--accent)" }}>Sales Velocity</a>.
      </p>
      <XrayClient isSuper={isSuper} companies={companies ?? []} />
      <ModuleLinks current="xray" scope={scope} />
    </>
  );
}
