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
  const [copiedEmbed, setCopiedEmbed] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const set = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  const captureUrl = config?.capture_token ? `${functionUrl}?token=${config.capture_token}` : null;

  // A complete copy-paste website form — non-technical users drop this into any
  // site builder's HTML/embed block; it POSTs straight to the capture URL.
  const embedCode = captureUrl
    ? `<form onsubmit="event.preventDefault();var f=this,b=f.querySelector('button');b.disabled=true;fetch('${captureUrl}',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:f.name.value,phone:f.phone.value,email:f.email.value,source:'website'})}).then(function(r){return r.json()}).then(function(){f.reset();b.disabled=false;f.querySelector('.msg').textContent='Thank you! We will call you shortly.'}).catch(function(){b.disabled=false;f.querySelector('.msg').textContent='Something went wrong, please try again.'});return false;" style="max-width:360px;display:flex;flex-direction:column;gap:10px;font-family:sans-serif">
  <input name="name" placeholder="Your name" required style="padding:10px;border:1px solid #ccc;border-radius:8px" />
  <input name="phone" placeholder="Phone number" required style="padding:10px;border:1px solid #ccc;border-radius:8px" />
  <input name="email" type="email" placeholder="Email (optional)" style="padding:10px;border:1px solid #ccc;border-radius:8px" />
  <button type="submit" style="padding:12px;border:0;border-radius:8px;background:#4353B8;color:#fff;font-weight:600;cursor:pointer">Get a call back</button>
  <span class="msg" style="font-size:13px;color:#16a34a"></span>
</form>`
    : null;

  async function sendTest() {
    if (!captureUrl) return;
    setTesting(true); setTestResult(null);
    try {
      const res = await fetch(captureUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "✅ Capture Test", phone: "9000000001", source: "test", external_id: "capture-selftest" }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.ok) {
        setTestResult({ ok: true, msg: j.deduped
          ? "Working ✓ — the endpoint is live (a test lead already exists in Leads → New)."
          : "Working ✓ — a test lead landed in Leads → New. Safe to delete it." });
      } else {
        setTestResult({ ok: false, msg: j.error || `Failed (${res.status})` });
      }
    } catch {
      setTestResult({ ok: false, msg: "Couldn't reach the capture URL. Is capture active?" });
    }
    setTesting(false);
  }

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

      {/* Test it — one click proves the whole pipeline works. */}
      {captureUrl && (
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ ...lbl, color: "var(--text)", fontWeight: 600 }}>Test it</span>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button className="primary" type="button" onClick={sendTest} disabled={testing || !form.active}
              style={{ background: "rgba(67,83,184,0.15)", color: "var(--accent, #4353B8)", border: "1px solid rgba(67,83,184,0.4)" }}>
              {testing ? "Sending…" : "🧪 Send a test lead"}
            </button>
            {!form.active && <span style={{ fontSize: 12, color: "#f59e0b" }}>Turn on “Capture active” and Save first.</span>}
            {testResult && (
              <span style={{ fontSize: 13, color: testResult.ok ? "#16a34a" : "#f87171" }}>{testResult.msg}</span>
            )}
          </div>
        </div>
      )}

      {/* No-code embed — paste-into-any-website form. The headline "easy setup". */}
      {embedCode && (
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ ...lbl, color: "var(--text)", fontWeight: 600 }}>Add to your website — no code</span>
            <button className="primary" type="button"
              onClick={() => { navigator.clipboard.writeText(embedCode); setCopiedEmbed(true); setTimeout(() => setCopiedEmbed(false), 1200); }}>
              {copiedEmbed ? "Copied ✓" : "📋 Copy form code"}
            </button>
          </div>
          <p style={{ color: "var(--muted)", fontSize: 12.5, margin: 0 }}>
            Copy this and paste it into any website builder’s <b>HTML / embed</b> block (WordPress, Wix, Framer, Shopify, a landing page…).
            Every submission lands here as a new lead — no Zapier, no coding.
          </p>
          <code style={{ display: "block", padding: 12, background: "rgba(0,0,0,0.25)", borderRadius: 8, color: "var(--text)", fontSize: 11.5, whiteSpace: "pre-wrap", maxHeight: 190, overflowY: "auto" }}>
            {embedCode}
          </code>
        </div>
      )}

      {captureUrl && (
        <details style={{ borderTop: "1px solid var(--border)", paddingTop: 14, fontSize: 13, color: "var(--muted)" }}>
          <summary style={{ cursor: "pointer", color: "var(--text)", fontWeight: 600 }}>Advanced — send leads from your own code / CRM</summary>
          <div style={{ marginTop: 8 }}>
            POST JSON to the capture URL above —
            <code style={{ display: "block", marginTop: 6, padding: 10, background: "rgba(0,0,0,0.2)", borderRadius: 8, color: "var(--text)", fontSize: 12, whiteSpace: "pre-wrap" }}>
{`{ "name": "Ramesh", "phone": "98765 43210", "email": "r@x.com", "source": "website", "external_id": "form-123" }`}
            </code>
            <span>Only <code>phone</code> is required. Repeat submissions with the same phone/<code>external_id</code> are de-duplicated.</span>
          </div>
        </details>
      )}
    </div>
  );
}
