import { Suspense } from "react";
import { resolveScope } from "@/lib/dashboard/scope";
import { ModuleLinks } from "../ModuleLinks";
import { RouteSkeleton } from "../skeletons";
import { XrayClient, type Across, type Report } from "./XrayClient";

export default async function XrayPage({
  searchParams,
}: { searchParams: Promise<{ company?: string }> }) {
  const scope = await resolveScope(await searchParams, { require: "any" });
  const isSuper = scope.isSuper;
  const isAdmin = scope.role === "admin" || isSuper;

  if (!isAdmin) {
    return (
      <>
        <h2>Sales X-Ray</h2>
        <div className="empty">This page is for managers only.</div>
      </>
    );
  }

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
      {isSuper && scope.companyId && (
        <p className="subtitle" style={{ marginTop: -8 }}>
          One company, from the link. <a href="/dashboard/xray">Show every company</a>
        </p>
      )}
      <Suspense fallback={<RouteSkeleton title="Sales X-Ray" bare />}>
        <XrayData isSuper={isSuper} companyId={isSuper ? scope.companyId : null} />
      </Suspense>
      <ModuleLinks current="xray" scope={scope} />
    </>
  );
}

async function XrayData({ isSuper, companyId }: { isSuper: boolean; companyId: string | null }) {
  const { supabase } = await resolveScope(undefined, { require: "any" });
  const companiesP = isSuper
    ? supabase.from("companies").select("id, name").order("name").returns<{ id: string; name: string | null }[]>()
    : Promise.resolve({ data: [] as { id: string; name: string | null }[], error: null });
  const storedP = isSuper && companyId
    ? supabase.from("sales_xray").select("report, created_at").eq("company_id", companyId).order("created_at", { ascending: false }).limit(1).maybeSingle()
    : isSuper
      ? supabase.from("sales_xray").select("company_id, report, created_at").order("created_at", { ascending: false }).limit(200)
      : supabase.from("sales_xray").select("report, created_at").order("created_at", { ascending: false }).limit(1).maybeSingle();

  const [companiesRes, storedRes] = await Promise.all([companiesP, storedP]);
  const companies = companiesRes.data ?? [];

  if (storedRes.error) {
    return (
      <XrayClient
        isSuper={isSuper}
        companies={companies}
        initialCompanyId={companyId ?? ""}
        initialError={storedRes.error.message}
        initialAcross={isSuper && !companyId ? [] : null}
      />
    );
  }

  if (isSuper && companyId) {
    const row = storedRes.data as { report: Report; created_at: string } | null;
    return (
      <XrayClient
        isSuper
        companies={companies}
        initialCompanyId={companyId}
        initialReport={row?.report ?? null}
        initialAt={row?.created_at ?? null}
        initialAcross={null}
      />
    );
  }

  if (isSuper) {
    const seen = new Set<string>();
    const across: Across[] = [];
    for (const r of (storedRes.data ?? []) as { company_id: string; report: Report; created_at: string }[]) {
      if (seen.has(r.company_id)) continue;
      seen.add(r.company_id);
      const top = (r.report?.objections ?? [])[0];
      across.push({
        companyId: r.company_id,
        name: companies.find((c) => c.id === r.company_id)?.name ?? "Company",
        at: r.created_at,
        headline: r.report?.headline,
        topLabel: top?.label,
        topCount: top?.count,
        gold: (r.report?.gold ?? []).length,
      });
    }
    return <XrayClient isSuper companies={companies} initialAcross={across} />;
  }

  const row = storedRes.data as { report: Report; created_at: string } | null;
  return (
    <XrayClient
      isSuper={false}
      companies={[]}
      initialReport={row?.report ?? null}
      initialAt={row?.created_at ?? null}
    />
  );
}
