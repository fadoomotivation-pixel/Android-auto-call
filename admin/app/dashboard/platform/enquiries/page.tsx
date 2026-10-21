import { getServiceSupabase } from "@/lib/supabase/service";
import { isSuperAdmin, saveEnquiryAction } from "./actions";

// Website enquiries — answers from the ₹999 website onboarding form
// (public.site999_onboarding). Super admin only: the check runs on the server
// and rows are read with the service role, so no company user can ever reach
// them (RLS is on and the only policy is the form's anon INSERT).

type Row = {
  id: string; created_at: string; name: string | null; whatsapp: string | null;
  email: string | null; city: string | null; brand: string | null;
  data: Record<string, unknown> | null; status: string | null; notes: string | null;
  follow_up_at: string | null;
};

const TABS = ["due", "new", "contacted", "won", "lost", "all"] as const;
const STATUS_TABS = ["new", "contacted", "won", "lost"];
const BASE = "/dashboard/platform/enquiries";
// Bookkeeping the onboarding form adds to `data` (form version, how many service
// rows were open, which host sent it). Not an answer, so not shown as one.
const INTERNAL = new Set(["files", "v", "svcN", "sent_from", "_ni"]);

function digits(p: string | null) {
  const d = (p ?? "").replace(/\D/g, "");
  return d.length === 10 ? `91${d}` : d;
}
function when(iso: string) {
  return new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) + " IST";
}
// IST calendar day, for the date input and for "is it due".
function istDay(iso: string | Date) {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}
function isOpen(r: Row) {
  const s = r.status ?? "new";
  return s !== "won" && s !== "lost";
}
function label(k: string) {
  return k.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
}
function show(v: unknown): string {
  if (v == null || v === "") return "—";
  if (Array.isArray(v)) return v.map(show).join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}
function qs(p: Record<string, string | undefined>) {
  const s = new URLSearchParams(Object.entries(p).filter(([, v]) => v) as [string, string][]).toString();
  return s ? `?${s}` : "";
}

export default async function EnquiriesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; id?: string }>;
}) {
  if (!(await isSuperAdmin())) return <div className="empty">Not authorized — super admin only.</div>;
  const sp = await searchParams;
  const tabParam = (TABS as readonly string[]).includes(sp.status ?? "") ? sp.status! : null;
  const q = (sp.q ?? "").trim();
  const sb = getServiceSupabase();

  const { data: all, error } = await sb
    .from("site999_onboarding")
    .select("id, created_at, name, whatsapp, email, city, brand, data, status, notes, follow_up_at")
    .order("created_at", { ascending: false })
    .limit(1000)
    .returns<Row[]>();
  if (error) return <div className="error">Could not load enquiries: {error.message}</div>;
  const rows = all ?? [];

  const counts: Record<string, number> = { all: rows.length };
  for (const r of rows) counts[r.status ?? "new"] = (counts[r.status ?? "new"] ?? 0) + 1;
  // Follow up due: an open enquiry whose follow-up day is today or earlier (IST).
  const today = istDay(new Date());
  const isDue = (r: Row) => isOpen(r) && !!r.follow_up_at && istDay(r.follow_up_at) <= today;
  counts.due = rows.filter(isDue).length;
  // Land on "Follow up due" when something is due, else on "New".
  const tab = tabParam ?? (counts.due > 0 ? "due" : "new");

  const needle = q.toLowerCase();
  const list = rows.filter((r) =>
    (tab === "all" || (tab === "due" ? isDue(r) : (r.status ?? "new") === tab)) &&
    (!needle || [r.name, r.brand, r.city, r.whatsapp, r.email].some((v) => (v ?? "").toLowerCase().includes(needle))));

  const current = sp.id ? rows.find((r) => r.id === sp.id) ?? null : null;
  let files: { field: string; path: string; url: string | null }[] = [];
  if (current) {
    const map = (current.data?.files ?? {}) as Record<string, string[]>;
    const paths = Object.entries(map).flatMap(([field, v]) => (Array.isArray(v) ? v : []).map((path) => ({ field, path })));
    files = await Promise.all(paths.map(async (f) => {
      const { data } = await sb.storage.from("site999-uploads").createSignedUrl(f.path, 3600);
      return { ...f, url: data?.signedUrl ?? null };
    }));
  }

  return (
    <>
      <h2>Website enquiries</h2>
      <p className="subtitle">People who filled the website form on website.callproai.in. Call them, set a status and a follow-up date.</p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0" }}>
        {TABS.map((t) => (
          <a key={t} href={`${BASE}${qs({ status: t, q })}`} className={t === tab ? "btn" : "btn btn-secondary"}>
            {t === "due" ? "Follow up due" : label(t)} ({counts[t] ?? 0})
          </a>
        ))}
        <form method="get" action={BASE} style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
          <input type="hidden" name="status" value={tab} />
          <input name="q" defaultValue={q} placeholder="Search name, business, city, phone" />
          <button className="btn btn-secondary" type="submit">Search</button>
        </form>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: current ? "minmax(260px,1fr) 2fr" : "1fr", gap: 16 }}>
        <div className="card" style={{ padding: 0 }}>
          {list.length === 0 && <div className="empty" style={{ padding: 16 }}>No enquiries here yet.</div>}
          {list.map((r) => (
            <a key={r.id} href={`${BASE}${qs({ status: tab, q, id: r.id })}`}
              style={{ display: "block", padding: "12px 16px", borderBottom: "1px solid var(--border)", color: "inherit", textDecoration: "none",
                background: r.id === current?.id ? "var(--surface-2, rgba(0,0,0,0.04))" : undefined }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <strong>{r.brand || r.name || "Unnamed"}</strong>
                <span className="badge">{isDue(r) ? "follow up" : r.status ?? "new"}</span>
              </div>
              <div style={{ fontSize: "var(--text-footnote)", opacity: 0.7 }}>
                {[r.name, r.city, r.whatsapp].filter(Boolean).join(" · ")} · {when(r.created_at)}
              </div>
            </a>
          ))}
        </div>

        {current && (
          <div className="card" style={{ padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              <div>
                <h3 style={{ margin: 0 }}>{current.brand || current.name || "Unnamed"}</h3>
                <div style={{ opacity: 0.7, fontSize: "var(--text-footnote)" }}>{when(current.created_at)}</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {current.whatsapp && <a className="btn" href={`tel:+${digits(current.whatsapp)}`}>Call</a>}
                {current.whatsapp && (
                  <a className="btn btn-secondary" target="_blank" rel="noreferrer"
                    href={`https://wa.me/${digits(current.whatsapp)}?text=${encodeURIComponent(`Hi ${current.name ?? ""}, thanks for sharing your business details for your website. When is a good time to call you?`)}`}>
                    WhatsApp
                  </a>
                )}
                {current.email && <a className="btn btn-secondary" href={`mailto:${current.email}`}>Email</a>}
              </div>
            </div>

            <form action={saveEnquiryAction} style={{ display: "grid", gap: 8, margin: "16px 0" }}>
              <input type="hidden" name="id" value={current.id} />
              <label className="label">Status</label>
              <select name="status" defaultValue={current.status ?? "new"}>
                {STATUS_TABS.map((t) => <option key={t} value={t}>{label(t)}</option>)}
              </select>
              <label className="label">Follow-up date (10:00 AM IST)</label>
              <input type="date" name="follow_up" defaultValue={current.follow_up_at ? istDay(current.follow_up_at) : ""} />
              <label className="label">Notes</label>
              <textarea name="notes" rows={3} defaultValue={current.notes ?? ""} placeholder="What did they say?" />
              <button className="btn" type="submit" style={{ justifySelf: "start" }}>Save</button>
            </form>

            <table className="table" style={{ width: "100%" }}>
              <tbody>
                {[["Name", current.name], ["WhatsApp", current.whatsapp], ["Email", current.email], ["City", current.city], ["Business", current.brand]]
                  .map(([k, v]) => <tr key={k as string}><td style={{ opacity: 0.7 }}>{k}</td><td>{show(v)}</td></tr>)}
                {Object.entries(current.data ?? {}).filter(([k]) => !INTERNAL.has(k)).map(([k, v]) => (
                  <tr key={k}><td style={{ opacity: 0.7, verticalAlign: "top" }}>{label(k)}</td><td style={{ whiteSpace: "pre-wrap" }}>{show(v)}</td></tr>
                ))}
              </tbody>
            </table>

            {files.length > 0 && (
              <>
                <h4>Files (links work for 1 hour)</h4>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  {files.map((f) => (
                    <a key={f.path} href={f.url ?? "#"} target="_blank" rel="noreferrer" style={{ fontSize: "var(--text-footnote)" }}>
                      {f.url && /\.(png|jpe?g|webp|gif)$/i.test(f.path)
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={f.url} alt={f.field} style={{ width: 120, height: 120, objectFit: "cover", borderRadius: 8, display: "block" }} />
                        : null}
                      {label(f.field)}: {f.path.split("/").pop()}
                    </a>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}
