import { Suspense } from "react";
import { resolveScope } from "@/lib/dashboard/scope";
import { ModuleLinks } from "../ModuleLinks";
import { RouteSkeleton } from "../skeletons";
import { PulseClient, type Company } from "./PulseClient";

function istToday(): string {
  return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

export default async function PulsePage({
  searchParams,
}: { searchParams: Promise<{ company?: string }> }) {
  const scope = await resolveScope(await searchParams, { require: "any" });
  const isSuper = scope.isSuper;
  const isAdmin = scope.role === "admin" || isSuper;

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
      <h2>Daily Pulse</h2>
      <p className="subtitle">
        <strong>What each telecaller did today.</strong> Built from their calls, voice notes and lead
        movements — short enough to forward to the owner as it is. Play any voice note to hear the rep
        in their own words.
      </p>
      <p className="subtitle" style={{ marginTop: -8, fontSize: 12.5 }}>
        A rep showing no activity may not be idle — <a href="/dashboard/health" style={{ color: "var(--accent)" }}>Phone Health</a> says
        whether their phone is even reporting.
      </p>
      {isSuper && scope.companyId && (
        <p className="subtitle" style={{ marginTop: -8 }}>
          One company, from the link. <a href="/dashboard/pulse">Show every company</a>
        </p>
      )}
      <Suspense fallback={<RouteSkeleton title="Daily Pulse" bare />}>
        <PulseData isSuper={isSuper} companyId={scope.companyId} />
      </Suspense>
      <ModuleLinks current="pulse" scope={scope} />
    </>
  );
}

async function PulseData({ isSuper, companyId }: { isSuper: boolean; companyId: string | null }) {
  const { supabase } = await resolveScope(undefined, { require: "any" });
  const date = istToday();
  const { data, error } = await supabase.functions.invoke<{
    ok: boolean; error?: string; companies?: Company[];
  }>("team-pulse", { body: companyId ? { date, company_id: companyId } : { date } });
  const failed = error || !data?.ok;
  return (
    <PulseClient
      isSuper={isSuper}
      companyId={companyId}
      initialDate={date}
      initialCompanies={failed ? [] : (data?.companies ?? [])}
      initialError={failed ? (data?.error || error?.message || "Couldn't build the pulse.") : null}
    />
  );
}
