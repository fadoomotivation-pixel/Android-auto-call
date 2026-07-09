"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

interface FbIntegration {
  page_id: string;
  page_access_token_secret_id: string | null; // token itself lives in Vault, never sent to the client
  verify_token: string;
  created_at: string;
  dataset_id: string | null;
  capi_enabled: boolean | null;
  capi_token_secret_id: string | null;
  capi_event_map: Record<string, string> | null;
  auto_assign: boolean | null;
}

// Which funnel stage sends which Meta event by default (matches the meta-capi function).
const DEFAULT_EVENT_MAP: Record<string, string> = {
  interested: "QualifiedLead",
  site_visit: "Schedule",
  negotiation: "InitiateCheckout",
  token_paid: "Purchase",
  booked: "Purchase",
};
const STAGE_LABELS: Record<string, string> = {
  interested: "Interested",
  site_visit: "Site visit",
  negotiation: "Negotiation",
  token_paid: "Token paid",
  booked: "Booked / Won",
};

export default function FacebookSetupPage() {
  const supabase = createClient();
  const [integration, setIntegration] = useState<FbIntegration | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [pageId, setPageId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [verifyToken, setVerifyToken] = useState("");
  // Lead routing: on = auto-assign to least-loaded telecaller; off = leave
  // unassigned for the admin to distribute (super-admin decides).
  const [autoAssign, setAutoAssign] = useState(true);

  // CAPI (send conversions back to Meta)
  const [datasetId, setDatasetId] = useState("");
  const [capiToken, setCapiToken] = useState("");
  const [capiEnabled, setCapiEnabled] = useState(false);
  const [eventMap, setEventMap] = useState<Record<string, string>>({ ...DEFAULT_EVENT_MAP });
  const [savingCapi, setSavingCapi] = useState(false);

  const webhookUrl = "https://rqgkzamuohdvttnkluzn.supabase.co/functions/v1/facebook-webhook";

  useEffect(() => {
    async function load() {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) return;
      
      const { data: profile } = await supabase.from("profiles").select("company_id").eq("id", userData.user.id).single();
      if (!profile?.company_id) return;

      const { data } = await supabase
        .from("facebook_integrations")
        .select("*")
        .eq("company_id", profile.company_id)
        .maybeSingle();

      if (data) {
        setIntegration(data);
        setPageId(data.page_id);
        setVerifyToken(data.verify_token);
        setDatasetId(data.dataset_id ?? "");
        setCapiEnabled(!!data.capi_enabled);
        setAutoAssign(data.auto_assign ?? true);
        setEventMap({ ...DEFAULT_EVENT_MAP, ...(data.capi_event_map ?? {}) });
        // tokens are write-only — never fetched to the client (they live in Vault)
      } else {
        // Generate a random verify token for new setup
        setVerifyToken(Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15));
      }
      setLoading(false);
    }
    load();
  }, [supabase]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    
    const { data: userData } = await supabase.auth.getUser();
    const { data: profile } = await supabase.from("profiles").select("company_id").eq("id", userData?.user?.id!).single();
    
    if (profile?.company_id) {
      // 1) Upsert the non-secret row first so it exists for the token RPC.
      const { error } = await supabase.from("facebook_integrations").upsert({
        company_id: profile.company_id,
        page_id: pageId,
        verify_token: verifyToken,
        auto_assign: autoAssign,
        updated_at: new Date().toISOString()
      });

      if (error) {
        alert("Error saving: " + error.message);
        setSaving(false);
        return;
      }

      // 2) Store the token in Vault only if a new one was entered (blank = keep current).
      if (accessToken.trim()) {
        const { error: tErr } = await supabase.rpc("set_facebook_token", {
          p_company: profile.company_id, p_token: accessToken.trim(),
        });
        if (tErr) {
          alert("Error saving token: " + tErr.message);
          setSaving(false);
          return;
        }
        setAccessToken("");
      }
      alert("Saved successfully! Now configure the webhook in your Meta App Dashboard.");
    }
    setSaving(false);
  }

  async function handleSaveCapi(e: React.FormEvent) {
    e.preventDefault();
    if (!integration) {
      alert("Save the Page integration above first, then set up conversions.");
      return;
    }
    setSavingCapi(true);
    const { data: userData } = await supabase.auth.getUser();
    const { data: profile } = await supabase.from("profiles").select("company_id").eq("id", userData?.user?.id!).single();
    if (profile?.company_id) {
      const { error } = await supabase.rpc("set_facebook_capi", {
        p_company: profile.company_id,
        p_dataset_id: datasetId.trim() || null,
        p_token: capiToken.trim() || null, // blank = keep current
        p_event_map: eventMap,
        p_enabled: capiEnabled,
      });
      if (error) {
        alert("Error saving conversions setup: " + error.message);
      } else {
        setCapiToken("");
        setIntegration({
          ...integration,
          dataset_id: datasetId.trim() || null,
          capi_enabled: capiEnabled,
          capi_token_secret_id: capiToken.trim() ? "saved" : integration.capi_token_secret_id,
          capi_event_map: eventMap,
        });
        alert("Conversions setup saved. Meta will now learn which leads convert.");
      }
    }
    setSavingCapi(false);
  }

  const inputStyle = { width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "rgba(255,255,255,0.02)", color: "var(--text)", outline: "none", backdropFilter: "blur(12px)", transition: "all 0.2s" } as const;
  const labelStyle = { display: "block", marginBottom: 8, fontSize: 13, fontWeight: 500, color: "var(--muted)", letterSpacing: "0.2px" } as const;

  if (loading) return <div>Loading...</div>;

  return (
    <div style={{ maxWidth: 700, display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h2 style={{ margin: "0 0 4px 0", letterSpacing: "-0.5px" }}>📱 Facebook Lead Ads Setup</h2>
        <p className="subtitle" style={{ margin: 0 }}>Automatically sync leads from your Facebook & Instagram campaigns.</p>
      </div>
      
      <div className="card" style={{ background: "rgba(255,255,255,0.015)", border: "1px solid var(--border)", backdropFilter: "blur(16px)", padding: 32, boxShadow: "0 8px 32px rgba(0,0,0,0.15)", borderRadius: 16 }}>
        <h3 style={{ marginTop: 0, color: "var(--accent)", fontSize: 15, letterSpacing: "1px", textTransform: "uppercase" }}>Step 1: Setup Meta App</h3>
        <p style={{ fontSize: 14, color: "var(--muted)", marginBottom: 20, lineHeight: 1.6 }}>
          1. Go to developers.facebook.com and create an app (Type: Business).<br />
          2. Add the "Webhooks" product and select "Page".<br />
          3. Subscribe to the <b style={{ color: "var(--text)" }}>leadgen</b> field.<br />
          4. Use the Webhook URL and Verify Token below.
        </p>
        
        <div style={{ background: "rgba(24, 119, 242, 0.05)", border: "1px solid rgba(24, 119, 242, 0.3)", padding: 16, borderRadius: 12, marginBottom: 32, fontFamily: "monospace", fontSize: 13, boxShadow: "0 0 20px rgba(24, 119, 242, 0.1)" }}>
          <div><b style={{ color: "#1877F2" }}>Webhook URL:</b> {webhookUrl}</div>
          <div style={{ marginTop: 8 }}><b style={{ color: "#1877F2" }}>Verify Token:</b> {verifyToken}</div>
        </div>
        
        <h3 style={{ margin: "0 0 8px 0", color: "var(--accent)", fontSize: 15, letterSpacing: "1px", textTransform: "uppercase" }}>Step 2: Connect Page</h3>
        <p style={{ fontSize: 14, color: "var(--muted)", marginBottom: 20, lineHeight: 1.6 }}>
          1. Go to Graph API Explorer or your App settings to generate a <b style={{ color: "var(--text)" }}>Page Access Token</b>.<br />
          2. Find your <b style={{ color: "var(--text)" }}>Page ID</b> from your Facebook Page About section.
        </p>

        <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={{ display: "block", marginBottom: 8, fontSize: 13, fontWeight: 500, color: "var(--muted)", letterSpacing: "0.2px" }}>Facebook Page ID</label>
            <input 
              type="text" 
              value={pageId} 
              onChange={e => setPageId(e.target.value)} 
              placeholder="e.g. 1029384756"
              style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "rgba(255,255,255,0.02)", color: "var(--text)", outline: "none", backdropFilter: "blur(12px)", transition: "all 0.2s" }}
              required
            />
          </div>
          
          <div>
            <label style={{ display: "block", marginBottom: 8, fontSize: 13, fontWeight: 500, color: "var(--muted)", letterSpacing: "0.2px" }}>
              Page Access Token {integration?.page_access_token_secret_id && <span style={{ color: "#1877F2" }}>· saved 🔒</span>}
            </label>
            <input
              type="password"
              autoComplete="off"
              value={accessToken}
              onChange={e => setAccessToken(e.target.value)}
              placeholder={integration?.page_access_token_secret_id ? "Stored securely — leave blank to keep current" : "EAABw..."}
              style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "rgba(255,255,255,0.02)", color: "var(--text)", outline: "none", backdropFilter: "blur(12px)", transition: "all 0.2s" }}
              required={!integration?.page_access_token_secret_id}
            />
          </div>

          {/* Lead routing — auto-assign vs admin-controlled distribution */}
          <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 16, background: "rgba(255,255,255,0.02)" }}>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={autoAssign}
                onChange={(e) => setAutoAssign(e.target.checked)}
                style={{ marginTop: 3, width: 18, height: 18, accentColor: "#1877F2", flexShrink: 0 }}
              />
              <span>
                <span style={{ fontWeight: 600, color: "var(--text)" }}>Auto-assign new leads to telecallers</span>
                <span style={{ display: "block", fontSize: 13, color: "var(--muted)", marginTop: 4, lineHeight: 1.5 }}>
                  {autoAssign
                    ? "On — each new lead goes straight to the least-busy telecaller."
                    : "Off — new leads arrive UNASSIGNED. You (admin) decide who works each one from Lead Management (per-lead Assign, or one-click Distribute)."}
                </span>
              </span>
            </label>
          </div>

          <button
            type="submit"
            disabled={saving}
            style={{ 
              background: "linear-gradient(135deg, #1877F2, #0A52CC)", 
              color: "white", 
              padding: "12px 20px", 
              borderRadius: 8, 
              border: "none", 
              fontWeight: 600,
              cursor: saving ? "wait" : "pointer",
              boxShadow: "0 4px 16px rgba(24, 119, 242, 0.3)",
              marginTop: 8,
            }}
          >
            {saving ? "Saving..." : "Save Integration"}
          </button>
        </form>
      </div>

      {/* Step 3 — close the loop: send conversions BACK to Meta (CAPI) */}
      <div className="card" style={{ background: "rgba(255,255,255,0.015)", border: "1px solid var(--border)", backdropFilter: "blur(16px)", padding: 32, boxShadow: "0 8px 32px rgba(0,0,0,0.15)", borderRadius: 16 }}>
        <h3 style={{ marginTop: 0, color: "var(--accent)", fontSize: 15, letterSpacing: "1px", textTransform: "uppercase" }}>Step 3: Send conversions back to Meta</h3>
        <p style={{ fontSize: 14, color: "var(--muted)", marginBottom: 20, lineHeight: 1.6 }}>
          Teach Meta which leads actually convert. When a Meta lead reaches a stage below, we send Meta a
          Conversions API event (keyed on the original lead), so its optimization finds more people like your
          <b style={{ color: "var(--text)" }}> best</b> buyers — not just more form-fillers.
        </p>

        <form onSubmit={handleSaveCapi} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={labelStyle}>Pixel / Dataset ID</label>
            <input type="text" value={datasetId} onChange={(e) => setDatasetId(e.target.value)} placeholder="e.g. 1234567890123456" style={inputStyle} />
            <p style={{ fontSize: 12, color: "var(--muted)", margin: "6px 2px 0" }}>Events Manager → Data Sources → your pixel → Settings → <b>Dataset ID</b>.</p>
          </div>

          <div>
            <label style={labelStyle}>
              Conversions API Token {integration?.capi_token_secret_id && <span style={{ color: "#1877F2" }}>· saved 🔒</span>}
            </label>
            <input
              type="password"
              autoComplete="off"
              value={capiToken}
              onChange={(e) => setCapiToken(e.target.value)}
              placeholder={integration?.capi_token_secret_id ? "Stored securely — leave blank to keep current" : "Generate under Pixel → Settings → Conversions API"}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Stage → Meta event</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {Object.keys(DEFAULT_EVENT_MAP).map((stage) => (
                <div key={stage} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ minWidth: 120, fontSize: 13, color: "var(--text)" }}>{STAGE_LABELS[stage]}</span>
                  <span style={{ color: "var(--muted)" }}>→</span>
                  <input
                    type="text"
                    value={eventMap[stage] ?? ""}
                    onChange={(e) => setEventMap((m) => ({ ...m, [stage]: e.target.value }))}
                    placeholder="(don't send)"
                    style={{ ...inputStyle, flex: 1 }}
                  />
                </div>
              ))}
            </div>
            <p style={{ fontSize: 12, color: "var(--muted)", margin: "8px 2px 0" }}>
              Leave a row blank to not send that stage. Each signal is sent once per lead.
            </p>
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 14, color: "var(--text)" }}>
            <input type="checkbox" checked={capiEnabled} onChange={(e) => setCapiEnabled(e.target.checked)} style={{ width: 18, height: 18 }} />
            Enable sending conversions to Meta
          </label>

          <button
            type="submit"
            disabled={savingCapi}
            style={{ background: "linear-gradient(135deg, #1877F2, #0A52CC)", color: "white", padding: "12px 20px", borderRadius: 8, border: "none", fontWeight: 600, cursor: savingCapi ? "wait" : "pointer", boxShadow: "0 4px 16px rgba(24, 119, 242, 0.3)", marginTop: 4 }}
          >
            {savingCapi ? "Saving..." : "Save Conversions Setup"}
          </button>
        </form>
      </div>
    </div>
  );
}
