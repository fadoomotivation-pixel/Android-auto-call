import { Suspense } from "react";
import { resolveScope } from "@/lib/dashboard/scope";
import { ModuleLinks } from "../ModuleLinks";
import { istDayYear } from "@/lib/dashboard/format";
import { RouteSkeleton } from "../skeletons";
import { CoachPanel } from "./CoachPanel";
import { KnowledgeBase } from "./KnowledgeBase";
import { BestCalls, type Row as BestRow } from "./BestCalls";

type Digest = {
  id: string;
  company_id: string;
  digest_date: string;
  content: string | null;
  stats: Record<string, number> | null;
};

export default async function CoachPage({
  searchParams,
}: { searchParams: Promise<{ company?: string }> }) {
  const scope = await resolveScope(await searchParams, { require: "any" });
  const { isSuper } = scope;
  const isAdmin = scope.role === "admin" || isSuper;

  if (!isAdmin) {
    return (
      <>
        <h2>AI Coach</h2>
        <div className="empty">This page is for managers only.</div>
      </>
    );
  }

  return (
    <>
      <h2>🤖 AI Coach</h2>
      <p className="subtitle">
        A daily AI digest of your team&apos;s performance — wins, who needs coaching, and tomorrow&apos;s focus.
        It generates automatically every night; you can also run today&apos;s on demand.
      </p>

      <CoachPanel />

      {/* Best calls and the digest list are independent reads. Each streams
          as soon as it returns instead of the page waiting on both. */}
      <Suspense fallback={<RouteSkeleton title="Best calls" bare />}>
        <BestCallsData isSuper={isSuper} />
      </Suspense>

      <KnowledgeBase />

      <Suspense fallback={<RouteSkeleton title="AI Coach digests" bare />}>
        <DigestList isSuper={isSuper} />
      </Suspense>
      <ModuleLinks current="coach" scope={scope} />
    </>
  );
}

async function BestCallsData({ isSuper }: { isSuper: boolean }) {
  const { supabase } = await resolveScope(undefined, { require: "any" });
  const { data, error } = await supabase.rpc("best_calls", { p_period: "day", p_days: 14 });
  return (
    <BestCalls
      isSuper={isSuper}
      initialRows={error ? [] : ((data as BestRow[] | null) ?? [])}
      initialError={error?.message ?? null}
    />
  );
}

async function DigestList({ isSuper }: { isSuper: boolean }) {
  const { supabase } = await resolveScope(undefined, { require: "any" });
  // RLS scopes digests to the admin's company; super-admin sees all.
  // Company names run in parallel with the digest read, not after it.
  const [digestsRes, companiesRes] = await Promise.all([
    supabase.from("manager_digests")
      .select("id, company_id, digest_date, content, stats")
      .order("digest_date", { ascending: false })
      .limit(30)
      .returns<Digest[]>(),
    isSuper
      ? supabase.from("companies").select("id, name").returns<{ id: string; name: string }[]>()
      : Promise.resolve({ data: [] as { id: string; name: string }[], error: null }),
  ]);
  if (digestsRes.error) {
    return <div className="error" style={{ marginTop: 16 }}>{digestsRes.error.message}</div>;
  }
  const nameById = new Map((companiesRes.data ?? []).map((c) => [c.id, c.name]));
  const rows = digestsRes.data ?? [];

  if (rows.length === 0) {
    return <div className="empty">No digests yet. Click &ldquo;Generate today&apos;s digest&rdquo; to create your first one.</div>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 20 }}>
      {rows.map((d) => (
        <div key={d.id} className="card hover-scale" style={{ background: "rgba(255,255,255,0.015)", border: "1px solid var(--border)", backdropFilter: "blur(16px)", borderRadius: 16, padding: 24, boxShadow: "0 8px 32px rgba(0,0,0,0.15)", transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
            <strong style={{ fontSize: 16, color: "#fff", letterSpacing: "0.2px" }}>
              {istDayYear(d.digest_date)}
              {isSuper && <span style={{ color: "var(--muted)", fontWeight: 400 }}> · {nameById.get(d.company_id) ?? "—"}</span>}
            </strong>
            {d.stats && <DigestStats stats={d.stats} />}
          </div>
          <div style={{ whiteSpace: "pre-wrap", fontSize: 15, lineHeight: 1.6, color: "rgba(255,255,255,0.85)" }}>{d.content}</div>
        </div>
      ))}
    </div>
  );
}

function DigestStats({ stats }: { stats: Record<string, number> }) {
  const chip = (label: string, value: number | undefined) => (
    <span style={{ fontSize: 12, color: "var(--text)", background: "rgba(255,255,255,0.05)", padding: "6px 12px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.1)", display: "flex", alignItems: "center", gap: 6, fontWeight: 500, letterSpacing: "0.5px" }}>
      <strong style={{ color: "#fff", fontSize: 14 }}>{value ?? 0}</strong> <span style={{ color: "var(--muted)", textTransform: "uppercase", fontSize: 10 }}>{label}</span>
    </span>
  );
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {chip("calls", stats.calls_total)}
      {chip("connected", stats.calls_connected)}
      {chip("booked", stats.booked_today)}
      {chip("idle leads", stats.idle_leads)}
      {chip("present", stats.reps_present)}
    </div>
  );
}
