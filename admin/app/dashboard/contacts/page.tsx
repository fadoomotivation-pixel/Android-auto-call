import { createClient } from "@/lib/supabase/server";
import type { Contact } from "@/lib/types";

export default async function ContactsPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500)
    .returns<Contact[]>();

  const rows = data ?? [];

  return (
    <>
      <h2>Contacts</h2>
      <p className="subtitle">Imported call lists stored on the cloud (latest 500).</p>

      {error && <div className="error">{error.message}</div>}

      {rows.length === 0 ? (
        <div className="empty">No contacts imported yet.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>Email</th>
              <th>Company</th>
              <th>Status</th>
              <th>Imported</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td>{c.name || "—"}</td>
                <td>{c.phone}</td>
                <td>{c.email || "—"}</td>
                <td>{c.company_name || "—"}</td>
                <td>
                  <span className={`badge ${c.status}`}>{c.status}</span>
                </td>
                <td>{new Date(c.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
