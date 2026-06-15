import { createClient } from "@/lib/supabase/server";
import { createTelecallerAction } from "./actions";

export default async function NewTelecallerPage() {
  const supabase = await createClient();
  const { data: companies } = await supabase
    .from("companies")
    .select("id, name")
    .order("name", { ascending: true });

  return (
    <>
      <h2>Create New Telecaller</h2>
      <p className="subtitle">Provision a telecaller account and assign them to a company.</p>
      
      <div className="login-box" style={{ margin: 0, width: "100%", maxWidth: 400 }}>
        <form action={createTelecallerAction}>
          <div className="field">
            <label>Company</label>
            <select name="company_id" required style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--panel-2)", color: "var(--text)" }}>
              <option value="">Select Company</option>
              {companies?.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Full Name</label>
            <input type="text" name="name" required placeholder="John Doe" />
          </div>

          <div className="field">
            <label>Email</label>
            <input type="email" name="email" required placeholder="john@example.com" />
          </div>

          <div className="field">
            <label>Password</label>
            <input type="password" name="password" required placeholder="Minimum 6 characters" minLength={6} />
          </div>

          <div className="field">
            <label>Phone (Optional)</label>
            <input type="tel" name="phone" placeholder="+1234567890" />
          </div>
          
          <button type="submit" className="primary" style={{ marginTop: 16 }}>
            Create Telecaller
          </button>
        </form>
      </div>
    </>
  );
}
