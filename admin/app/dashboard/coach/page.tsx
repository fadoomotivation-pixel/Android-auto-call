import { resolveScope } from "@/lib/dashboard/scope";
import { ModuleLinks } from "../ModuleLinks";
import { istDayYear } from "@/lib/dashboard/format";
import { CoachPanel } from "./CoachPanel";
import { KnowledgeBase } from "./KnowledgeBase";
import { BestCalls } from "./BestCalls";

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
  const { supabase, isSuper } = scope;
  const isAdmin = scope.role === "admin" || isSuper;

  if (!isAdmin) {
    return (
      <>
        <h2>AI Coach</h2>
        <div className="empty">This page is for managers only.</div>
      </>
    );
  }

  // RLS scopes digests to the admin's company; super-admin sees all.
  const { data: digests } = await supabase
    .from("manager_digests")
    .select("id, company_id, digest_date, content, stats")
    .order("digest_date", { ascending: false })
    .limit(30)
    .returns<Digest[]>();

  let nameById = new Map<string, string>();
  if (isSuper) {
    const { data: companies } = await supabase.from("companies").select("id, name").returns<{ id: string; name: string }[]>();
    nameById = new Map((companies ?? []).map((c) => [c.id, c.name]));
  }

  const rows = digests ?? [];

  return (
    <>
      <h2>🤖 AI Coach</h2>
      <p className="subtitle">
        A daily AI digest of your team&apos;s performance — wins, who needs coaching, and tomorrow&apos;s focus.
        It generates automatically every night; you can also run today&apos;s on demand.
      </p>

      <CoachPanel />

      <BestCalls isSuper={isSuper} />

      <KnowledgeBase />

      {rows.length === 0 ? (
        <div className="empty">No digests yet. Click &ldquo;Generate today&apos;s digest&rdquo; to create your first one.</div>
      ) : (
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
      )}
      <ModuleLinks current="coach" scope={scope} />
    </>
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
