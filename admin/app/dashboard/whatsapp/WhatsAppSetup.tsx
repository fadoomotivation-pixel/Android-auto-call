"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Integration = {
  phone_number_id: string;
  waba_id: string | null;
  access_token_secret_id: string | null; // token itself lives in Vault, never sent to the client
  verify_token: string;
  display_number: string | null;
  default_salesperson_id: string | null;
  active: boolean;
} | null;
type Member = { id: string; full_name: string | null };

const input: React.CSSProperties = {
  padding: "10px 14px", borderRadius: 8, border: "1px solid var(--border)",
  background: "rgba(255,255,255,0.02)", color: "var(--text)", width: "100%",
  outline: "none", backdropFilter: "blur(12px)", transition: "all 0.2s"
};
const field: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 6, minWidth: 0 };
const lbl: React.CSSProperties = { fontSize: 13, color: "var(--muted)", fontWeight: 500, letterSpacing: "0.2px" };

export function WhatsAppSetup({
  companyId, integration, webhookUrl, members,
}: { companyId: string; integration: Integration; webhookUrl: string; members: Member[] }) {
  const router = useRouter();
  const tokenSaved = !!integration?.access_token_secret_id;
  const [form, setForm] = useState({
    phone_number_id: integration?.phone_number_id ?? "",
    waba_id: integration?.waba_id ?? "",
    access_token: "", // write-only; never prefilled from the server (token is in Vault)
    verify_token: integration?.verify_token ?? crypto.randomUUID().replace(/-/g, ""),
    display_number: integration?.display_number ?? "",
    default_salesperson_id: integration?.default_salesperson_id ?? "",
    active: integration?.active ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    setSaving(true); setErr(null); setSaved(false);
    const supabase = createClient();
    // 1) Upsert the (non-secret) integration row first so it exists for the token RPC.
    const { error } = await supabase.from("whatsapp_integrations").upsert({
      company_id: companyId,
      phone_number_id: form.phone_number_id.trim(),
      waba_id: form.waba_id.trim() || null,
      verify_token: form.verify_token.trim(),
      display_number: form.display_number.trim() || null,
      default_salesperson_id: form.default_salesperson_id || null,
      active: form.active,
      updated_at: new Date().toISOString(),
    });
    if (error) { setSaving(false); setErr(error.message); return; }
    // 2) Store the token in Vault only if a new one was entered (blank = keep current).
    if (form.access_token.trim()) {
      const { error: tErr } = await supabase.rpc("set_whatsapp_token", {
        p_company: companyId, p_token: form.access_token.trim(),
      });
      if (tErr) { setSaving(false); setErr(tErr.message); return; }
    }
    setSaving(false);
    setForm((f) => ({ ...f, access_token: "" }));
    setSaved(true); router.refresh(); setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 20, background: "rgba(255,255,255,0.015)", border: "1px solid var(--border)", backdropFilter: "blur(16px)", padding: 24, boxShadow: "0 8px 32px rgba(0,0,0,0.15)" }}>
      <strong style={{ fontSize: 16, letterSpacing: "0.5px", background: "linear-gradient(90deg, #25D366, #128C7E)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Connect your WhatsApp number (Meta Cloud API)</strong>

      {/* The two walls every owner hits at Meta's end, before any of the fields
          below matter. Both look like our bug and neither is; saying so here is
          the difference between a 5-minute setup and a stuck afternoon. */}
      <details style={{ background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 12, padding: "12px 14px" }}>
        <summary style={{ cursor: "pointer", fontWeight: 600, color: "#f59e0b", fontSize: 14 }}>
          ⚠️ Getting an error from Meta while adding a number? Read this first.
        </summary>

        <div style={{ marginTop: 12, fontSize: 13.5, lineHeight: 1.65, color: "var(--text)" }}>
          <strong>1. &quot;This phone number is already registered to a WhatsApp account&quot;</strong>
          <p style={{ margin: "4px 0 8px", color: "var(--muted)" }}>
            This is not a CRM error. It is a Meta rule. One number can live in one place only:
            <strong> either the WhatsApp or WhatsApp Business app, or the Cloud API</strong>. Not both. Providers like Wati
            follow the same rule. They just hide it behind a guided flow.
          </p>
          <p style={{ margin: "0 0 4px", color: "var(--muted)" }}>Two ways:</p>
          <ul style={{ margin: "0 0 10px 18px", color: "var(--muted)" }}>
            <li>
              <strong style={{ color: "var(--text)" }}>Use a different number (easier and better)</strong> — leave the number
              on the phone as it is, and add a new number for the API
              (any SIM, or a landline). Most companies do this.
            </li>
            <li>
              <strong style={{ color: "var(--text)" }}>You need the same number</strong> — on that phone,
              open WhatsApp Business → <em>Settings → Account → Delete my account</em> → remove the number.
              Wait 5 minutes, then try Meta again. <strong>Careful:</strong> this deletes that phone&apos;s
              WhatsApp account and its chats.
            </li>
          </ul>

          <strong>2. The app must be &quot;Live&quot;, or messages will not arrive</strong>
          <p style={{ margin: "4px 0 0", color: "var(--muted)" }}>
            If the Meta app is in <em>Development</em> mode, only test webhooks arrive. Real customer
            messages never come through. In the Meta dashboard, set the app to <strong>Live / Publish</strong>.
            Sending still works. Receiving stops.
          </p>

          <p style={{ margin: "10px 0 0", color: "var(--muted)" }}>
            After both are done, fill the fields below and tap Save. Then run <strong>🩺 Connection check</strong>
            above, and confirm it really works.
          </p>
        </div>
      </details>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <label style={field}><span style={lbl}>Phone number ID</span>
          <input style={input} value={form.phone_number_id} onChange={(e) => set("phone_number_id", e.target.value)} placeholder="from Meta → WhatsApp → API setup" /></label>
        <label style={field}><span style={lbl}>Display number (+91…)</span>
          <input style={input} value={form.display_number} onChange={(e) => set("display_number", e.target.value)} placeholder="+91 98xxxxxxx" /></label>
        <label style={{ ...field, gridColumn: "1 / -1" }}><span style={lbl}>Permanent access token {tokenSaved && <span style={{ color: "#25D366" }}>· saved 🔒</span>}</span>
          <input style={input} type="password" autoComplete="off" value={form.access_token} onChange={(e) => set("access_token", e.target.value)}
            placeholder={tokenSaved ? "Stored securely — leave blank to keep current" : "System-user token from Meta"} /></label>
        <label style={field}><span style={lbl}>WABA ID (optional)</span>
          <input style={input} value={form.waba_id} onChange={(e) => set("waba_id", e.target.value)} /></label>
        <label style={field}><span style={lbl}>Verify token (auto-generated)</span>
          <input style={input} value={form.verify_token} onChange={(e) => set("verify_token", e.target.value)} /></label>
        <label style={{ ...field, gridColumn: "1 / -1" }}><span style={lbl}>Default rep for messages from unknown numbers</span>
          <select style={input} value={form.default_salesperson_id} onChange={(e) => set("default_salesperson_id", e.target.value)}>
            <option value="">— none (leave unassigned) —</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.full_name ?? m.id}</option>)}
          </select></label>
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input type="checkbox" checked={form.active} onChange={(e) => set("active", e.target.checked)} />
        <span>Active</span>
      </label>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
        <button className="primary" onClick={save} disabled={saving} style={{ background: "linear-gradient(135deg, #25D366, #128C7E)", border: "none", boxShadow: "0 4px 16px rgba(37, 211, 102, 0.3)", padding: "10px 20px", fontWeight: 600 }}>
          {saving ? "Saving…" : "Save WhatsApp settings"}
        </button>
        {saved && <span style={{ color: "var(--ok, #16a34a)", fontSize: 13 }}>Saved ✓</span>}
        {err && <span className="error" style={{ fontSize: 13 }}>{err}</span>}
      </div>

      <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 16, fontSize: 13, color: "var(--muted)", marginTop: 8 }}>
        <strong style={{ color: "var(--text)", letterSpacing: "0.3px" }}>In Meta → WhatsApp → Configuration, set the webhook:</strong>
        <div style={{ marginTop: 8, padding: 12, background: "rgba(0,0,0,0.2)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.05)" }}>
          <div>Callback URL:&nbsp;
            <code style={{ color: "var(--accent)" }}>{webhookUrl}</code></div>
          <div style={{ marginTop: 6 }}>Verify token: paste the <em>same</em> verify token shown above.</div>
        </div>
        <div style={{ marginTop: 12 }}>Then subscribe to the <code>messages</code> field. Inbound + outbound messages will appear below.</div>
      </div>
    </div>
  );
}
