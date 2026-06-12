import { createClient } from "@/lib/supabase/server";

interface CompanyRow { id: string; name: string }
interface StorageRow { company_id: string; account_email: string | null; folder_id: string | null }

export default async function StoragePage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; err?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  const { data: pa } = await supabase
    .from("platform_admins").select("user_id").eq("user_id", user!.id).maybeSingle();
  if (!pa) return <div className="empty">Not authorized — super admin only.</div>;

  const [{ data: companies }, { data: integ }, { data: platform }] = await Promise.all([
    supabase.from("companies").select("id, name").order("name").returns<CompanyRow[]>(),
    supabase.from("storage_integrations").select("company_id, account_email, folder_id").returns<StorageRow[]>(),
    supabase.from("platform_storage").select("account_email, refresh_token").eq("id", true).maybeSingle<{ account_email: string | null; refresh_token: string | null }>(),
  ]);
  const byCompany = new Map((integ ?? []).map((i) => [i.company_id, i]));
  const platformConnected = !!platform?.refresh_token;

  return (
    <>
      <h2>Recording storage (Google Drive)</h2>
      <p className="subtitle">
        Recordings upload to a company&apos;s own Drive if it has one, otherwise to your <strong>platform Drive</strong> below
        (each company in its own subfolder). Auto-deleted after 30 days.
      </p>

      {sp.ok && <div className="success">✓ Google Drive connected.</div>}
      {sp.err && <div className="error">Connect failed: {sp.err}</div>}

      <div className="card" style={{ margin: "12px 0 20px" }}>
        <div className="label">Platform Drive (default for all companies)</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
          {platformConnected ? (
            <>
              <span className="badge connected">Connected</span>
              {platform?.account_email && <span className="subtitle">{platform.account_email}</span>}
              <a className="link" style={{ color: "var(--accent)" }} href="/api/gdrive/start?platform=1">Reconnect</a>
            </>
          ) : (
            <a className="primary" style={{ width: "auto", padding: "8px 14px", textDecoration: "none" }} href="/api/gdrive/start?platform=1">
              Connect platform Drive (your 5TB)
            </a>
          )}
        </div>
        <p className="subtitle" style={{ margin: "8px 0 0" }}>
          Every company without its own Drive saves recordings here, each in its own subfolder.
        </p>
      </div>

      <div className="label">Per-company Drive (optional override)</div>
      <table>
        <thead>
          <tr>
            <th>Company</th>
            <th>Drive account</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {(companies ?? []).map((c) => {
            const s = byCompany.get(c.id);
            return (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{s?.account_email || "—"}</td>
                <td>{s ? <span className="badge connected">Connected</span> : "Not connected"}</td>
                <td>
                  <a className="link" href={`/api/gdrive/start?company=${c.id}`}>
                    {s ? "Reconnect" : "Connect Google Drive"}
                  </a>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p className="subtitle" style={{ marginTop: 16 }}>
        Setup: create an OAuth client (type “Web application”) in Google Cloud, add
        <code> {`{this site}`}/api/gdrive/callback </code> as an authorized redirect URI, enable the Drive API,
        and set <code>GOOGLE_CLIENT_ID</code> / <code>GOOGLE_CLIENT_SECRET</code> in both Vercel and the
        Supabase Edge Function secrets.
      </p>
    </>
  );
}
