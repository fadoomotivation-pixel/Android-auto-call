import { createClient } from "@/lib/supabase/server";
import type { ContactDetail } from "@/lib/types";

export default async function PlatformContactsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: pa } = await supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user!.id)
    .maybeSingle();
  if (!pa) return <div className="empty">Not authorized — super admin only.</div>;

  const { data, error } = await supabase
    .from("v_contact_details")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1000)
    .returns<ContactDetail[]>();

  const rows = data ?? [];

  return (
    <>
      <h2>Contacts (all companies)</h2>
      <p className="subtitle">
        Every contact across the platform — including those from deleted campaigns — with the notes telecallers saved.
      </p>

      {error && <div className="error">{error.message}</div>}

      {rows.length === 0 ? (
        <div className="empty">No contacts yet.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>Company</th>
              <th>Telecaller</th>
              <th>Campaign</th>
              <th>Status</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td>{c.name || "—"}</td>
                <td>{c.phone}</td>
                <td>{c.company_name || "—"}</td>
                <td>{c.salesperson_name || "—"}</td>
                <td>
                  {c.campaign_name || "—"}
                  {c.campaign_deleted && (
                    <span className="badge dnc" style={{ marginLeft: 6 }}>deleted</span>
                  )}
                </td>
                <td><span className={`badge ${c.status}`}>{c.status}</span></td>
                <td style={{ maxWidth: 280, whiteSpace: "pre-wrap" }}>{c.notes || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
