import { Suspense } from "react";
import { resolveScope } from "@/lib/dashboard/scope";
import { RouteSkeleton } from "../skeletons";
import {
  FacebookClient,
  type FbIntegration,
  type FbStats,
  type RecentLead,
} from "./FacebookClient";

export default function FacebookPage() {
  return (
    <Suspense fallback={<RouteSkeleton title="Facebook Leads" />}>
      <FacebookData />
    </Suspense>
  );
}

function mintVerify() {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

/** Midnight at the start of today in India, as UTC. Not the server's UTC day. */
function istMidnightIso(now = Date.now()): string {
  const ist = new Date(now + 5.5 * 3600_000);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - 5.5 * 3600_000).toISOString();
}

async function FacebookData() {
  // fallback "first" is the company the editor opens on. It is not a view of
  // "all companies" — a Page connection belongs to one tenant. A super admin
  // still gets the picker and is not pinned to their own profile company.
  const scope = await resolveScope(undefined, {
    require: "any",
    withCompanies: true,
    fallback: "first",
  });
  const companyId = scope.isSuper ? (scope.companyId ?? "") : (scope.homeCompanyId ?? "");
  const emptyStats: FbStats = { today: 0, d7: 0, d30: 0, conversions: 0, failed: 0 };

  if (!companyId) {
    return (
      <FacebookClient
        isSuper={scope.isSuper}
        companies={scope.companies}
        companyId=""
        integration={null}
        integrationError={null}
        recent={[]}
        recentError={null}
        stats={emptyStats}
        statsError={scope.isSuper
          ? "No companies yet, so there is no Facebook setup to open."
          : "This account is not in a company, so Facebook leads cannot be loaded."}
        freshVerifyToken={mintVerify()}
      />
    );
  }

  const { supabase, isSuper } = scope;
  const startToday = istMidnightIso();
  const d7 = new Date(Date.now() - 7 * 864e5).toISOString();
  const d30 = new Date(Date.now() - 30 * 864e5).toISOString();
  const contacts = () => {
    let q = supabase.from("contacts").select("id", { count: "exact", head: true }).eq("lead_source", "facebook");
    if (!isSuper) q = q.eq("company_id", companyId);
    return q;
  };
  const capi = (ok: boolean) => {
    let q = supabase.from("capi_events").select("id", { count: "exact", head: true }).eq("ok", ok);
    if (!isSuper) q = q.eq("company_id", companyId);
    return q;
  };

  const [integ, leads, today, week, month, conv, failedEvents] = await Promise.all([
    supabase.from("facebook_integrations").select("*").eq("company_id", companyId).maybeSingle(),
    supabase.from("contacts")
      .select("id, name, phone, created_at, extra")
      .eq("company_id", companyId)
      .eq("lead_source", "facebook")
      .order("created_at", { ascending: false })
      .limit(8),
    contacts().gte("created_at", startToday),
    contacts().gte("created_at", d7),
    contacts().gte("created_at", d30),
    capi(true),
    capi(false),
  ]);

  const statsError = [today.error, week.error, month.error, conv.error, failedEvents.error]
    .flatMap((e) => (e ? [e.message] : []))
    .join(" · ") || null;

  return (
    <FacebookClient
      isSuper={isSuper}
      companies={isSuper ? scope.companies : []}
      companyId={companyId}
      integration={(integ.data as FbIntegration | null) ?? null}
      integrationError={integ.error?.message ?? null}
      recent={(leads.data as RecentLead[] | null) ?? []}
      recentError={leads.error?.message ?? null}
      stats={statsError ? emptyStats : {
        today: today.count ?? 0,
        d7: week.count ?? 0,
        d30: month.count ?? 0,
        conversions: conv.count ?? 0,
        failed: failedEvents.count ?? 0,
      }}
      statsError={statsError}
      freshVerifyToken={mintVerify()}
    />
  );
}
