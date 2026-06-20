"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

interface FbIntegration {
  page_id: string;
  page_access_token_secret_id: string | null; // token itself lives in Vault, never sent to the client
  verify_token: string;
  created_at: string;
}

export default function FacebookSetupPage() {
  const supabase = createClient();
  const [integration, setIntegration] = useState<FbIntegration | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [pageId, setPageId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [verifyToken, setVerifyToken] = useState("");
  
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
        // token is write-only — never fetched to the client (it's in Vault)
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
    </div>
  );
}
