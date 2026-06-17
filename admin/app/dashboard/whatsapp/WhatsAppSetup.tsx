"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Integration = {
  phone_number_id: string;
  waba_id: string | null;
  access_token: string;
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
  const [form, setForm] = useState({
    phone_number_id: integration?.phone_number_id ?? "",
    waba_id: integration?.waba_id ?? "",
    access_token: integration?.access_token ?? "",
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
    const { error } = await supabase.from("whatsapp_integrations").upsert({
      company_id: companyId,
      phone_number_id: form.phone_number_id.trim(),
      waba_id: form.waba_id.trim() || null,
      access_token: form.access_token.trim(),
      verify_token: form.verify_token.trim(),
      display_number: form.display_number.trim() || null,
      default_salesperson_id: form.default_salesperson_id || null,
      active: form.active,
      updated_at: new Date().toISOString(),
    });
    setSaving(false);
    if (error) { setErr(error.message); return; }
    setSaved(true); router.refresh(); setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 20, background: "rgba(255,255,255,0.015)", border: "1px solid var(--border)", backdropFilter: "blur(16px)", padding: 24, boxShadow: "0 8px 32px rgba(0,0,0,0.15)" }}>
      <strong style={{ fontSize: 16, letterSpacing: "0.5px", background: "linear-gradient(90deg, #25D366, #128C7E)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Connect your WhatsApp number (Meta Cloud API)</strong>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <label style={field}><span style={lbl}>Phone number ID</span>
          <input style={input} value={form.phone_number_id} onChange={(e) => set("phone_number_id", e.target.value)} placeholder="from Meta → WhatsApp → API setup" /></label>
        <label style={field}><span style={lbl}>Display number (+91…)</span>
          <input style={input} value={form.display_number} onChange={(e) => set("display_number", e.target.value)} placeholder="+91 98xxxxxxx" /></label>
        <label style={{ ...field, gridColumn: "1 / -1" }}><span style={lbl}>Permanent access token</span>
          <input style={input} value={form.access_token} onChange={(e) => set("access_token", e.target.value)} placeholder="System-user token from Meta" /></label>
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
