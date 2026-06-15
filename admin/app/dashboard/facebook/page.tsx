"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

interface FbIntegration {
  page_id: string;
  page_access_token: string;
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
        setAccessToken(data.page_access_token);
        setVerifyToken(data.verify_token);
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
      const { error } = await supabase.from("facebook_integrations").upsert({
        company_id: profile.company_id,
        page_id: pageId,
        page_access_token: accessToken,
        verify_token: verifyToken,
        updated_at: new Date().toISOString()
      });
      
      if (!error) {
        alert("Saved successfully! Now configure the webhook in your Meta App Dashboard.");
      } else {
        alert("Error saving: " + error.message);
      }
    }
    setSaving(false);
  }

  if (loading) return <div>Loading...</div>;

  return (
    <div style={{ maxWidth: 700 }}>
      <h2>📱 Facebook Lead Ads Setup</h2>
      <p className="subtitle">Automatically sync leads from your Facebook & Instagram campaigns.</p>
      
      <div className="card" style={{ marginTop: 24 }}>
        <h3>Step 1: Setup Meta App</h3>
        <p style={{ fontSize: 14, color: "var(--muted)", marginBottom: 16 }}>
          1. Go to developers.facebook.com and create an app (Type: Business).<br />
          2. Add the "Webhooks" product and select "Page".<br />
          3. Subscribe to the <b>leadgen</b> field.<br />
          4. Use the Webhook URL and Verify Token below.
        </p>
        
        <div style={{ background: "var(--panel-2)", padding: 12, borderRadius: 6, marginBottom: 16, fontFamily: "monospace", fontSize: 13 }}>
          <div><b>Webhook URL:</b> {webhookUrl}</div>
          <div style={{ marginTop: 8 }}><b>Verify Token:</b> {verifyToken}</div>
        </div>
        
        <h3>Step 2: Connect Page</h3>
        <p style={{ fontSize: 14, color: "var(--muted)", marginBottom: 16 }}>
          1. Go to Graph API Explorer or your App settings to generate a <b>Page Access Token</b>.<br />
          2. Find your <b>Page ID</b> from your Facebook Page About section.
        </p>

        <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={{ display: "block", marginBottom: 6, fontSize: 13, fontWeight: 500 }}>Facebook Page ID</label>
            <input 
              type="text" 
              value={pageId} 
              onChange={e => setPageId(e.target.value)} 
              placeholder="e.g. 1029384756"
              style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--panel-2)", color: "var(--text)" }}
              required
            />
          </div>
          
          <div>
            <label style={{ display: "block", marginBottom: 6, fontSize: 13, fontWeight: 500 }}>Page Access Token</label>
            <input 
              type="password" 
              value={accessToken} 
              onChange={e => setAccessToken(e.target.value)} 
              placeholder="EAABw..."
              style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--panel-2)", color: "var(--text)" }}
              required
            />
          </div>
          
          <button 
            type="submit" 
            disabled={saving}
            style={{ 
              background: "var(--primary)", 
              color: "white", 
              padding: "10px 16px", 
              borderRadius: 6, 
              border: "none", 
              fontWeight: 600,
              cursor: saving ? "wait" : "pointer"
            }}
          >
            {saving ? "Saving..." : "Save Integration"}
          </button>
        </form>
      </div>
    </div>
  );
}
