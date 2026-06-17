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
        <div style={{ overflowX: "auto", borderRadius: 16, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(10, 10, 12, 0.4)", backdropFilter: "blur(24px)", boxShadow: "0 16px 40px rgba(0,0,0,0.3)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
          <thead>
            <tr style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
              <th style={{ padding: "16px 20px", color: "var(--muted)", fontWeight: 600, fontSize: 13, textTransform: "uppercase", letterSpacing: "1px" }}>Name</th>
              <th style={{ padding: "16px 20px", color: "var(--muted)", fontWeight: 600, fontSize: 13, textTransform: "uppercase", letterSpacing: "1px" }}>Phone</th>
              <th style={{ padding: "16px 20px", color: "var(--muted)", fontWeight: 600, fontSize: 13, textTransform: "uppercase", letterSpacing: "1px" }}>Email</th>
              <th style={{ padding: "16px 20px", color: "var(--muted)", fontWeight: 600, fontSize: 13, textTransform: "uppercase", letterSpacing: "1px" }}>Company</th>
              <th style={{ padding: "16px 20px", color: "var(--muted)", fontWeight: 600, fontSize: 13, textTransform: "uppercase", letterSpacing: "1px" }}>Status</th>
              <th style={{ padding: "16px 20px", color: "var(--muted)", fontWeight: 600, fontSize: 13, textTransform: "uppercase", letterSpacing: "1px" }}>Imported</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", transition: "background 0.2s" }} className="hover-row">
                <td style={{ padding: "16px 20px", fontWeight: 500, color: "#fff", maxWidth: "250px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={c.name || ""}>{c.name || "—"}</td>
                <td style={{ padding: "16px 20px", color: "var(--text)", whiteSpace: "nowrap" }}>{c.phone}</td>
                <td style={{ padding: "16px 20px", color: "var(--muted)", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={c.email || ""}>{c.email || "—"}</td>
                <td style={{ padding: "16px 20px", color: "var(--text)", maxWidth: "150px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={c.company_name || ""}>{c.company_name || "—"}</td>
                <td style={{ padding: "16px 20px" }}>
                  <span className={`badge ${c.status}`} style={{ boxShadow: "0 0 10px rgba(255,255,255,0.05)" }}>{c.status}</span>
                </td>
                <td style={{ padding: "16px 20px", color: "var(--muted)", fontSize: 13 }}>{new Date(c.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </>
  );
}
