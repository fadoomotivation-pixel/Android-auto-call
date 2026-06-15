import { createClient } from "@/lib/supabase/server";
import { CoachPanel } from "./CoachPanel";

type Digest = {
  id: string;
  company_id: string;
  digest_date: string;
  content: string | null;
  stats: Record<string, number> | null;
};

export default async function CoachPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: me }, { data: pa }] = await Promise.all([
    supabase.from("profiles").select("role, company_id").eq("id", user!.id).maybeSingle<{ role: string; company_id: string | null }>(),
    supabase.from("platform_admins").select("user_id").eq("user_id", user!.id).maybeSingle(),
  ]);
  const isSuper = !!pa;
  const isAdmin = me?.role === "admin" || isSuper;

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

      {rows.length === 0 ? (
        <div className="empty">No digests yet. Click &ldquo;Generate today&apos;s digest&rdquo; to create your first one.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 20 }}>
          {rows.map((d) => (
            <div key={d.id} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <strong>
                  {new Date(d.digest_date).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                  {isSuper && <span style={{ color: "var(--muted)", fontWeight: 400 }}> · {nameById.get(d.company_id) ?? "—"}</span>}
                </strong>
                {d.stats && <DigestStats stats={d.stats} />}
              </div>
              <div style={{ whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.5 }}>{d.content}</div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function DigestStats({ stats }: { stats: Record<string, number> }) {
  const chip = (label: string, value: number | undefined) => (
    <span style={{ fontSize: 12, color: "var(--muted)" }}>
      <strong style={{ color: "var(--text)" }}>{value ?? 0}</strong> {label}
    </span>
  );
  return (
    <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
      {chip("calls", stats.calls_total)}
      {chip("connected", stats.calls_connected)}
      {chip("booked", stats.booked_today)}
      {chip("idle leads", stats.idle_leads)}
      {chip("present", stats.reps_present)}
    </div>
  );
}
