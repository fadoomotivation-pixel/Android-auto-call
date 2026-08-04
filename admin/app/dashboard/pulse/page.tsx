import { resolveScope } from "@/lib/dashboard/scope";
import { ModuleLinks } from "../ModuleLinks";
import { PulseClient } from "./PulseClient";

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
      <h2>🔔 Daily Pulse</h2>
      <p className="subtitle">
        <strong>What each telecaller did today.</strong> Built from their calls, voice notes and lead
        movements — short enough to forward to the owner as it is. Play any voice note to hear the rep
        in their own words.
      </p>
      <p className="subtitle" style={{ marginTop: -8, fontSize: 12.5 }}>
        A rep showing no activity may not be idle — <a href="/dashboard/health" style={{ color: "var(--accent)" }}>Phone Health</a> says
        whether their phone is even reporting.
      </p>
      <PulseClient isSuper={isSuper} />
      <ModuleLinks current="pulse" scope={scope} />
    </>
  );
}
