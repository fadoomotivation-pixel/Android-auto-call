"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Config = {
  capture_token: string;
  default_salesperson_id: string | null;
  welcome_enabled: boolean;
  welcome_template: string | null;
  welcome_template_lang: string;
  active: boolean;
} | null;
type Member = { id: string; full_name: string | null };

const input: React.CSSProperties = {
  padding: "10px 14px", borderRadius: 8, border: "1px solid var(--border)",
  background: "rgba(255,255,255,0.02)", color: "var(--text)", width: "100%", outline: "none",
};
const field: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 6, minWidth: 0 };
const lbl: React.CSSProperties = { fontSize: 13, color: "var(--muted)", fontWeight: 500 };

export function CaptureSetup({
  companyId, config, functionUrl, members,
}: { companyId: string; config: Config; functionUrl: string; members: Member[] }) {
  const router = useRouter();
  const [form, setForm] = useState({
    default_salesperson_id: config?.default_salesperson_id ?? "",
    welcome_enabled: config?.welcome_enabled ?? false,
    welcome_template: config?.welcome_template ?? "",
    welcome_template_lang: config?.welcome_template_lang ?? "en",
    active: config?.active ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const set = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  const captureUrl = config?.capture_token ? `${functionUrl}?token=${config.capture_token}` : null;

  async function save() {
    setSaving(true); setErr(null); setSaved(false);
    const supabase = createClient();
    // capture_token has a DB default — never overwrite it on update.
    const { error } = await supabase.from("lead_capture_config").upsert({
      company_id: companyId,
      default_salesperson_id: form.default_salesperson_id || null,
      welcome_enabled: form.welcome_enabled,
      welcome_template: form.welcome_template.trim() || null,
      welcome_template_lang: form.welcome_template_lang.trim() || "en",
      active: form.active,
      updated_at: new Date().toISOString(),
    });
    setSaving(false);
    if (error) { setErr(error.message); return; }
    setSaved(true); router.refresh(); setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 18, padding: 24 }}>
      {/* Capture URL */}
      <div>
        <span style={lbl}>Your capture URL</span>
        {captureUrl ? (
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <code style={{ ...input, fontSize: 12, overflowX: "auto", whiteSpace: "nowrap" }}>{captureUrl}</code>
            <button className="primary" type="button" style={{ whiteSpace: "nowrap" }}
              onClick={() => { navigator.clipboard.writeText(captureUrl); setCopied(true); setTimeout(() => setCopied(false), 1200); }}>
              {copied ? "Copied ✓" : "Copy"}
            </button>
          </div>
        ) : (
          <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 6 }}>Save once to generate your unique capture URL.</p>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <label style={field}><span style={lbl}>Assign new leads to</span>
          <select style={input} value={form.default_salesperson_id} onChange={(e) => set("default_salesperson_id", e.target.value)}>
            <option value="">— leave unassigned —</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.full_name ?? m.id}</option>)}
          </select></label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 24 }}>
          <input type="checkbox" checked={form.active} onChange={(e) => set("active", e.target.checked)} />
          <span>Capture active</span>
        </label>
      </div>

      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="checkbox" checked={form.welcome_enabled} onChange={(e) => set("welcome_enabled", e.target.checked)} />
          <span>Send an instant WhatsApp welcome to new leads</span>
        </label>
        {form.welcome_enabled && (
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
            <label style={field}><span style={lbl}>Approved template name</span>
              <input style={input} value={form.welcome_template} onChange={(e) => set("welcome_template", e.target.value)} placeholder="e.g. lead_welcome" /></label>
            <label style={field}><span style={lbl}>Language code</span>
              <input style={input} value={form.welcome_template_lang} onChange={(e) => set("welcome_template_lang", e.target.value)} placeholder="en" /></label>
          </div>
        )}
        {form.welcome_enabled && (
          <p style={{ color: "var(--muted)", fontSize: 12 }}>
            WhatsApp must be connected, and this must be a <b>Meta-approved template</b> (business-initiated messages can&apos;t be free text).
          </p>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button className="primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
        {saved && <span style={{ color: "#16a34a", fontSize: 13 }}>Saved ✓</span>}
        {err && <span className="error" style={{ fontSize: 13 }}>{err}</span>}
      </div>

      {captureUrl && (
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14, fontSize: 13, color: "var(--muted)" }}>
          <strong style={{ color: "var(--text)" }}>How to use:</strong> POST JSON to the URL above —
          <code style={{ display: "block", marginTop: 6, padding: 10, background: "rgba(0,0,0,0.2)", borderRadius: 8, color: "var(--text)", fontSize: 12, whiteSpace: "pre-wrap" }}>
{`{ "name": "Ramesh", "phone": "98765 43210", "email": "r@x.com", "source": "website", "external_id": "form-123" }`}
          </code>
          <span>Only <code>phone</code> is required. Repeat submissions with the same phone/<code>external_id</code> are de-duplicated.</span>
        </div>
      )}
    </div>
  );
}
