import { resolveScope } from "@/lib/dashboard/scope";
import { CompanyPicker } from "../whatsapp/CompanyPicker";
import { ContentLibrary } from "./ContentLibrary";

type Asset = {
  id: string;
  kind: string;
  title: string;
  url: string;
  description: string | null;
  active: boolean;
  created_at: string;
};

type Share = {
  sent_at: string;
  opened_at: string | null;
  open_count: number;
  channel: string | null;
  content_assets: { title: string } | null;
  contacts: { name: string | null; phone: string } | null;
};

function fmt(ts: string | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default async function ContentPage({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
  // fallback:"first" — this page EDITS one company's settings, so an unscoped
  // super admin lands on the first company rather than on nothing. That is the
  // one way these pages differ from the aggregating ones, and it now lives in
  // resolveScope instead of being re-derived here.
  const ctx = await resolveScope(await searchParams, { require: "any", fallback: "first" });
  const { supabase, isSuper, companies, companyId } = ctx;
  if (ctx.role !== "admin" && !isSuper) {
    return <><h2>Content Library</h2><div className="empty">Managers only.</div></>;
  }


  const { data: assets } = companyId
    ? await supabase.from("content_assets")
        .select("id, kind, title, url, description, active, created_at")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .returns<Asset[]>()
    : { data: null };

  const { data: shares } = companyId
    ? await supabase.from("content_shares")
        .select("sent_at, opened_at, open_count, channel, content_assets(title), contacts(name, phone)")
        .eq("company_id", companyId)
        .order("sent_at", { ascending: false })
        .limit(100)
        .returns<Share[]>()
    : { data: null };

  const sharesList = shares ?? [];
  const openedCount = sharesList.filter((s) => s.opened_at).length;

  return (
    <>
      <h2>📚 Content Library</h2>
      <p style={{ color: "var(--muted)", marginTop: -6 }}>
        Brochures, videos, reviews &amp; testimonials your reps can share with buyers over WhatsApp.
        Shared links are tracked — when a buyer opens one, the lead is automatically re-engaged.
      </p>
      {isSuper && <CompanyPicker companies={companies} selected={companyId} />}
      {!companyId
        ? <div className="empty">No company selected.</div>
        : <ContentLibrary companyId={companyId} assets={assets ?? []} />}

      {companyId && (
        <div className="card" style={{ marginTop: 20 }}>
          <h3 style={{ marginTop: 0 }}>
            Shares &amp; opens{" "}
            <span style={{ color: "var(--muted)", fontWeight: 400, fontSize: 14 }}>
              ({openedCount} of {sharesList.length} opened)
            </span>
          </h3>
          {sharesList.length === 0
            ? <div className="empty">No content shared yet. Reps share from the app; opens show up here.</div>
            : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "var(--muted)", fontSize: 12 }}>
                    <th style={{ padding: "6px 4px" }}>Content</th>
                    <th style={{ padding: "6px 4px" }}>Sent to</th>
                    <th style={{ padding: "6px 4px" }}>Sent</th>
                    <th style={{ padding: "6px 4px" }}>Opened</th>
                  </tr>
                </thead>
                <tbody>
                  {sharesList.map((s, i) => (
                    <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                      <td style={{ padding: "8px 4px" }}>{s.content_assets?.title ?? "—"}</td>
                      <td style={{ padding: "8px 4px" }}>{s.contacts?.name || s.contacts?.phone || "—"}</td>
                      <td style={{ padding: "8px 4px", color: "var(--muted)" }}>{fmt(s.sent_at)}</td>
                      <td style={{ padding: "8px 4px" }}>
                        {s.opened_at
                          ? <span style={{ color: "#16a34a", fontWeight: 600 }}>✅ {fmt(s.opened_at)}{s.open_count > 1 ? ` (${s.open_count}×)` : ""}</span>
                          : <span style={{ color: "var(--muted)" }}>Not yet</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>
      )}
    </>
  );
}
