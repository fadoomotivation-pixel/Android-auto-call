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

  const [{ data: companies }, { data: integ }] = await Promise.all([
    supabase.from("companies").select("id, name").order("name").returns<CompanyRow[]>(),
    supabase.from("storage_integrations").select("company_id, account_email, folder_id").returns<StorageRow[]>(),
  ]);
  const byCompany = new Map((integ ?? []).map((i) => [i.company_id, i]));

  return (
    <>
      <h2>Recording storage (Google Drive)</h2>
      <p className="subtitle">
        Connect a Google Drive account per company. Recordings are uploaded there and auto-deleted after 30 days.
      </p>

      {sp.ok && <div className="success">✓ Google Drive connected.</div>}
      {sp.err && <div className="error">Connect failed: {sp.err}</div>}

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
