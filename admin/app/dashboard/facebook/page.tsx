"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { FormRouting } from "./FormRouting";

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

type Check = { ok: boolean; label: string };
type RecentLead = { id: string; name: string | null; phone: string; created_at: string; extra: { form_id?: string; created_time?: string } | null };

type Company = { id: string; name: string | null };

export default function FacebookSetupPage() {
  const supabase = createClient();
  const [integration, setIntegration] = useState<FbIntegration | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Super admin serves EVERY company equally: they pick which tenant's Facebook
  // setup they're editing. A regular admin is silently pinned to their own.
  const [isSuper, setIsSuper] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);

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
  const [capiTesting, setCapiTesting] = useState(false);
  const [capiMsg, setCapiMsg] = useState<string | null>(null);
  const [pulling, setPulling] = useState(false);
  const [pullMsg, setPullMsg] = useState<string | null>(null);

  // Connection tester + auto-subscribe + recent leads
  const [companyId, setCompanyId] = useState<string>("");
  const [testing, setTesting] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [checks, setChecks] = useState<{ token?: Check; subscription?: Check; permission?: Check } | null>(null);
  const [connMsg, setConnMsg] = useState<string | null>(null);
  const [recentLeads, setRecentLeads] = useState<RecentLead[]>([]);
  // Live lead stats — super admin sees ALL companies (the central account serves
  // everyone); a regular admin sees only their own. CAPI = conversions we've sent
  // back to Meta so its optimization learns which leads convert.
  const [stats, setStats] = useState({ today: 0, d7: 0, d30: 0, conversions: 0, loading: true });
  // Auto health-check runs once when a token exists, so the super admin lands on
  // a live status instead of having to click "Test connection" every time.
  const [autoCheckedFor, setAutoCheckedFor] = useState<string>("");
  const [copiedField, setCopiedField] = useState<string>("");
  function copyField(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopiedField(key);
    setTimeout(() => setCopiedField((k) => (k === key ? "" : k)), 1200);
  }

  const webhookUrl = "https://rqgkzamuohdvttnkluzn.supabase.co/functions/v1/facebook-webhook";

  // Step 1: figure out who's viewing and which company to start on.
  useEffect(() => {
    async function init() {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) return;

      const [{ data: profile }, { data: pa }] = await Promise.all([
        supabase.from("profiles").select("company_id").eq("id", userData.user.id).maybeSingle<{ company_id: string | null }>(),
        supabase.from("platform_admins").select("user_id").eq("user_id", userData.user.id).maybeSingle(),
      ]);
      const superAdmin = !!pa;
      setIsSuper(superAdmin);

      if (superAdmin) {
        const { data: cos } = await supabase.from("companies").select("id, name").order("name").returns<Company[]>();
        setCompanies(cos ?? []);
        setCompanyId(cos?.[0]?.id ?? "");
        if (!cos || cos.length === 0) setLoading(false);
      } else if (profile?.company_id) {
        setCompanyId(profile.company_id);
      } else {
        setLoading(false);
      }
    }
    init();
  }, [supabase]);

  // Step 2: (re)load the integration whenever the selected company changes.
  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    async function loadIntegration() {
      setLoading(true);
      void loadRecentLeads(companyId);

      const { data } = await supabase
        .from("facebook_integrations")
        .select("*")
        .eq("company_id", companyId)
        .maybeSingle();
      if (cancelled) return;

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
        // Fresh company: reset the form and mint a new verify token.
        setIntegration(null);
        setPageId("");
        setDatasetId("");
        setCapiEnabled(false);
        setAutoAssign(true);
        setEventMap({ ...DEFAULT_EVENT_MAP });
        setVerifyToken(Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15));
      }
      setChecks(null);
      setConnMsg(null);
      setCapiMsg(null);
      setLoading(false);
    }
    loadIntegration();
    return () => { cancelled = true; };
  }, [companyId, supabase]);

  // Live stats — super admin's numbers span every company, so reload on identity
  // too (not just company switches).
  useEffect(() => {
    if (!isSuper && !companyId) return;
    void loadStats(isSuper, companyId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, isSuper]);

  // Land on a live connection status without making the admin click "Test".
  useEffect(() => {
    if (integration?.page_access_token_secret_id && companyId && autoCheckedFor !== companyId && !testing) {
      setAutoCheckedFor(companyId);
      void runTest();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [integration, companyId]);

  async function loadRecentLeads(company: string) {
    const { data } = await supabase
      .from("contacts")
      .select("id, name, phone, created_at, extra")
      .eq("company_id", company)
      .eq("lead_source", "facebook")
      .order("created_at", { ascending: false })
      .limit(8)
      .returns<RecentLead[]>();
    setRecentLeads(data ?? []);
  }

  // Facebook lead volume + conversions sent. Super admin: across every company
  // (the one central account feeds them all); regular admin: their own only.
  async function loadStats(superAdmin: boolean, company: string) {
    setStats((s) => ({ ...s, loading: true }));
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const d7 = new Date(now.getTime() - 7 * 864e5).toISOString();
    const d30 = new Date(now.getTime() - 30 * 864e5).toISOString();
    const scope = <T,>(q: T): T =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      superAdmin ? q : (q as any).eq("company_id", company);
    const base = () => scope(supabase.from("contacts").select("id", { count: "exact", head: true }).eq("lead_source", "facebook"));
    const [t, w, m, conv] = await Promise.all([
      base().gte("created_at", startToday),
      base().gte("created_at", d7),
      base().gte("created_at", d30),
      scope(supabase.from("capi_events").select("id", { count: "exact", head: true }).eq("ok", true)),
    ]);
    setStats({ today: t.count ?? 0, d7: w.count ?? 0, d30: m.count ?? 0, conversions: conv.count ?? 0, loading: false });
  }

  async function runTest() {
    setTesting(true);
    setChecks(null);
    setConnMsg(null);
    const { data, error } = await supabase.functions.invoke<{ ok: boolean; error?: string; checks?: typeof checks }>(
      "facebook-manage",
      { body: { action: "test", company_id: companyId } },
    );
    setTesting(false);
    if (error || !data?.ok) {
      setConnMsg(data?.error || error?.message || "Test failed.");
      return;
    }
    setChecks(data.checks ?? null);
  }

  async function runSubscribe() {
    setSubscribing(true);
    setConnMsg(null);
    const { data, error } = await supabase.functions.invoke<{ ok: boolean; error?: string }>(
      "facebook-manage",
      { body: { action: "subscribe", company_id: companyId } },
    );
    setSubscribing(false);
    if (error || !data?.ok) {
      setConnMsg(data?.error || error?.message || "Subscribe failed.");
      return;
    }
    setConnMsg("✓ Page subscribed to the app for leadgen. Re-run the test to confirm.");
    void runTest();
  }

  async function runPageToken() {
    setFixing(true);
    setConnMsg(null);
    const { data, error } = await supabase.functions.invoke<{ ok: boolean; error?: string; converted?: boolean }>(
      "facebook-manage",
      { body: { action: "page_token", company_id: companyId } },
    );
    setFixing(false);
    if (error || !data?.ok) {
      setConnMsg(data?.error || error?.message || "Couldn't convert to a Page token.");
      return;
    }
    setConnMsg("✓ Converted your token to a Page Access Token and saved it. Re-testing…");
    void runTest();
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!companyId) { alert("Pick a company first."); return; }
    setSaving(true);

    // Operates on the SELECTED company (super admin) or the admin's own — both
    // resolved into companyId. The set_facebook_token RPC authorizes a
    // platform_admin for any company, so this stays safe.
    // 1) Upsert the non-secret row first so it exists for the token RPC.
    const { error } = await supabase.from("facebook_integrations").upsert({
      company_id: companyId,
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
        p_company: companyId, p_token: accessToken.trim(),
      });
      if (tErr) {
        alert("Error saving token: " + tErr.message);
        setSaving(false);
        return;
      }
      setAccessToken("");
    }
    // Reflect the freshly-saved row so the token-dependent buttons unlock.
    setIntegration((prev) => ({
      page_id: pageId,
      page_access_token_secret_id: accessToken.trim() ? "saved" : (prev?.page_access_token_secret_id ?? null),
      verify_token: verifyToken,
      created_at: prev?.created_at ?? new Date().toISOString(),
      dataset_id: prev?.dataset_id ?? null,
      capi_enabled: prev?.capi_enabled ?? null,
      capi_token_secret_id: prev?.capi_token_secret_id ?? null,
      capi_event_map: prev?.capi_event_map ?? null,
      auto_assign: autoAssign,
    }));
    alert("Saved successfully! Now configure the webhook in your Meta App Dashboard.");
    setSaving(false);
  }

  async function runTestCapi() {
    setCapiTesting(true);
    setCapiMsg(null);
    const { data, error } = await supabase.functions.invoke<{ ok: boolean; error?: string; received?: number }>(
      "facebook-manage",
      { body: { action: "test_capi", company_id: companyId } },
    );
    setCapiTesting(false);
    if (error || !data?.ok) {
      setCapiMsg(data?.error || error?.message || "CAPI test failed.");
      return;
    }
    setCapiMsg(`✓ CAPI working — Meta accepted the test event (${data.received} received). Conversions will flow as leads progress.`);
  }

  // Manual catch-up: pull any Facebook leads the 10-min cron / webhook missed,
  // right now. Each imported lead is routed to its company + rep (so the rep gets
  // the notification), and the contact-insert trigger fires CAPI back to Meta.
  async function pullLeads() {
    setPulling(true);
    setPullMsg(null);
    const { data, error } = await supabase.functions.invoke<{ ok: boolean; error?: string; inserted?: number; dup?: number; forms?: number }>(
      "facebook-poll",
      { body: { since_days: 7 } },
    );
    setPulling(false);
    if (error || !data?.ok) {
      setPullMsg(data?.error || error?.message || "Couldn't pull leads.");
      return;
    }
    const n = data.inserted ?? 0;
    setPullMsg(
      n > 0
        ? `✓ ${n} new lead${n === 1 ? "" : "s"} imported — routed to their rep (CAPI + alert fired).`
        : `✓ Up to date — no missed leads (${data.dup ?? 0} already in CRM across ${data.forms ?? 0} form${data.forms === 1 ? "" : "s"}).`,
    );
    if (companyId) void loadStats(isSuper, companyId);
  }

  async function handleSaveCapi(e: React.FormEvent) {
    e.preventDefault();
    if (!integration) {
      alert("Save the Page integration above first, then set up conversions.");
      return;
    }
    if (!companyId) { alert("Pick a company first."); return; }
    setSavingCapi(true);
    const { error } = await supabase.rpc("set_facebook_capi", {
      p_company: companyId,
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
    setSavingCapi(false);
  }

  const inputStyle = { width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "rgba(255,255,255,0.02)", color: "var(--text)", outline: "none", backdropFilter: "blur(12px)", transition: "all 0.2s" } as const;
  const labelStyle = { display: "block", marginBottom: 8, fontSize: 13, fontWeight: 500, color: "var(--muted)", letterSpacing: "0.2px" } as const;

  if (loading) return <div>Loading...</div>;

  // Overall connection health, derived from the last test (auto-run on load).
  const checkList = checks ? [checks.token, checks.subscription, checks.permission].filter(Boolean) as Check[] : [];
  const allGood = checkList.length === 3 && checkList.every((c) => c.ok);
  const anyBad = checkList.some((c) => !c.ok);

  const header = (
    <div>
      <h2 style={{ margin: "0 0 4px 0", letterSpacing: "-0.5px" }}>📱 Facebook Lead Ads</h2>
      <p className="subtitle" style={{ margin: 0 }}>
        {isSuper
          ? "One central Facebook account runs ads for every company — leads route to each automatically."
          : "Your Facebook leads flow in automatically from the central Call Pro AI ad account."}
      </p>
    </div>
  );

  // The heart of the model: one account, many companies, super-admin controlled.
  const centralBanner = (
    <div className="card" style={{ background: "linear-gradient(135deg, rgba(24,119,242,0.10), rgba(24,119,242,0.02))", border: "1px solid rgba(24,119,242,0.28)", borderRadius: 16, padding: 20, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 18 }}>🏢</span>
        <span style={{ fontWeight: 700, color: "var(--text)", fontSize: 15 }}>One account → every company</span>
        {checks && (
          <span style={{ marginLeft: "auto", fontSize: 12.5, fontWeight: 600, padding: "4px 12px", borderRadius: 999,
            background: allGood ? "rgba(34,197,94,0.14)" : anyBad ? "rgba(248,113,113,0.14)" : "rgba(148,163,184,0.14)",
            color: allGood ? "#22c55e" : anyBad ? "#f87171" : "var(--muted)" }}>
            {allGood ? "✅ Connection live" : anyBad ? "⚠ Needs attention" : "Checking…"}
          </span>
        )}
      </div>
      <p style={{ margin: 0, fontSize: 13.5, color: "var(--muted)", lineHeight: 1.6 }}>
        All ad campaigns run from a <b style={{ color: "var(--text)" }}>single Call Pro AI Facebook account</b>. Every lead is
        auto-routed to the right company by its lead form.{" "}
        {isSuper
          ? "You (platform admin) own the connection and the form → company routing below."
          : "Your platform admin manages the connection centrally — you just receive the leads."}
      </p>
    </div>
  );

  const statsGrid = (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
      <FbStat label="Leads today" value={stats.today} tone="#1877F2" loading={stats.loading} />
      <FbStat label="Last 7 days" value={stats.d7} tone="#22c55e" loading={stats.loading} />
      <FbStat label="Last 30 days" value={stats.d30} tone="#a855f7" loading={stats.loading} />
      <FbStat label="Conversions → Meta" value={stats.conversions} tone="#f59e0b" loading={stats.loading} />
    </div>
  );

  const recentLeadsCard = (
    <div className="card" style={{ background: "rgba(255,255,255,0.015)", border: "1px solid var(--border)", backdropFilter: "blur(16px)", padding: 32, boxShadow: "0 8px 32px rgba(0,0,0,0.15)", borderRadius: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ margin: 0, color: "var(--accent)", fontSize: 15, letterSpacing: "1px", textTransform: "uppercase" }}>Recent Facebook leads</h3>
        <button type="button" onClick={() => companyId && loadRecentLeads(companyId)} disabled={!companyId}
          style={{ fontSize: 12, padding: "5px 12px", borderRadius: 7, border: "1px solid var(--border)", background: "rgba(255,255,255,0.04)", color: "var(--muted)", cursor: "pointer" }}>
          🔄 Refresh
        </button>
      </div>
      {recentLeads.length === 0 ? (
        <p style={{ fontSize: 14, color: "var(--muted)", margin: 0 }}>
          No Facebook leads yet. Once a lead form is submitted, it appears here within seconds.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {recentLeads.map((l) => (
            <div key={l.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "10px 14px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: 10, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontWeight: 600, color: "var(--text)" }}>{l.name || "(no name)"}</div>
                <div style={{ fontSize: 13, color: "var(--muted)", fontFamily: "monospace" }}>{l.phone}</div>
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)", textAlign: "right" }}>
                <div>🕒 {new Date(l.extra?.created_time ?? l.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</div>
                {l.extra?.form_id && <div style={{ opacity: 0.7 }}>form {String(l.extra.form_id).slice(-6)}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // A regular company admin does NOT configure Meta — the platform runs one
  // central account. Show them a clean, read-only view: what's happening and
  // their own incoming leads, minus the developer setup.
  if (!isSuper) {
    return (
      <div style={{ maxWidth: 700, display: "flex", flexDirection: "column", gap: 20 }}>
        {header}
        {centralBanner}
        {statsGrid}
        {recentLeadsCard}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 700, display: "flex", flexDirection: "column", gap: 20 }}>
      {header}
      {centralBanner}
      {statsGrid}

      {/* Super admin: pick which company's Facebook setup to manage. */}
      {isSuper && (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 13, color: "var(--muted)" }}>Company:</span>
          <select
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
            style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "rgba(255,255,255,0.02)", color: "var(--text)", minWidth: 220 }}
          >
            {companies.length === 0 && <option value="">No companies</option>}
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name ?? c.id}</option>)}
          </select>
        </div>
      )}

      {/* Multi-company routing: one central Facebook → each form to its company. */}
      {isSuper && <FormRouting />}

      {/* Manual catch-up — pull any leads the cron/webhook missed, on demand. */}
      {isSuper && (
        <div className="card" style={{ background: "rgba(16,185,129,0.05)", border: "1px solid rgba(16,185,129,0.25)", padding: 20, borderRadius: 16, marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ minWidth: 220, flex: 1 }}>
              <strong style={{ color: "#fff", fontSize: 15 }}>⚡ Pull Facebook leads now</strong>
              <p className="subtitle" style={{ marginTop: 2 }}>
                A lead didn&apos;t reach the rep in real time? Pull the last 7 days now — each missed lead
                is routed to its company &amp; rep (they get the alert), and CAPI fires back to Meta.
              </p>
            </div>
            <button
              type="button"
              onClick={pullLeads}
              disabled={pulling}
              style={{ background: "#10b981", color: "#04120c", fontWeight: 700, border: "none", padding: "12px 20px", borderRadius: 10, cursor: pulling ? "default" : "pointer", whiteSpace: "nowrap" }}
            >
              {pulling ? "Pulling…" : "Pull leads now"}
            </button>
          </div>
          {pullMsg && (
            <div style={{ marginTop: 12, fontSize: 14, color: pullMsg.startsWith("✓") ? "#10b981" : "#ef4444" }}>{pullMsg}</div>
          )}
        </div>
      )}

      <div className="card" style={{ background: "rgba(255,255,255,0.015)", border: "1px solid var(--border)", backdropFilter: "blur(16px)", padding: 32, boxShadow: "0 8px 32px rgba(0,0,0,0.15)", borderRadius: 16 }}>
        <h3 style={{ marginTop: 0, color: "var(--accent)", fontSize: 15, letterSpacing: "1px", textTransform: "uppercase" }}>Step 1: Setup Meta App</h3>
        <p style={{ fontSize: 14, color: "var(--muted)", marginBottom: 20, lineHeight: 1.6 }}>
          1. Go to developers.facebook.com and create an app (Type: Business).<br />
          2. Add the "Webhooks" product and select "Page".<br />
          3. Subscribe to the <b style={{ color: "var(--text)" }}>leadgen</b> field.<br />
          4. Use the Webhook URL and Verify Token below.
        </p>
        
        <div style={{ background: "rgba(24, 119, 242, 0.05)", border: "1px solid rgba(24, 119, 242, 0.3)", padding: 16, borderRadius: 12, marginBottom: 32, fontFamily: "monospace", fontSize: 13, boxShadow: "0 0 20px rgba(24, 119, 242, 0.1)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span><b style={{ color: "#1877F2" }}>Webhook URL:</b> {webhookUrl}</span>
            <button type="button" onClick={() => copyField(webhookUrl, "url")}
              style={{ fontSize: 11, padding: "3px 9px", borderRadius: 6, border: "1px solid rgba(24,119,242,0.4)", background: "rgba(24,119,242,0.1)", color: "#1877F2", cursor: "pointer" }}>
              {copiedField === "url" ? "Copied ✓" : "Copy"}
            </button>
          </div>
          <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span><b style={{ color: "#1877F2" }}>Verify Token:</b> {verifyToken}</span>
            <button type="button" onClick={() => copyField(verifyToken, "vt")}
              style={{ fontSize: 11, padding: "3px 9px", borderRadius: 6, border: "1px solid rgba(24,119,242,0.4)", background: "rgba(24,119,242,0.1)", color: "#1877F2", cursor: "pointer" }}>
              {copiedField === "vt" ? "Copied ✓" : "Copy"}
            </button>
          </div>
        </div>
        
        <h3 style={{ margin: "0 0 8px 0", color: "var(--accent)", fontSize: 15, letterSpacing: "1px", textTransform: "uppercase" }}>Step 2: Connect Page</h3>
        <p style={{ fontSize: 14, color: "var(--muted)", marginBottom: 12, lineHeight: 1.6 }}>
          1. Go to Graph API Explorer or your App settings to generate a <b style={{ color: "var(--text)" }}>Page Access Token</b>.<br />
          2. Find your <b style={{ color: "var(--text)" }}>Page ID</b> from your Facebook Page About section.
        </p>
        <div style={{ background: "rgba(255, 179, 0, 0.06)", border: "1px solid rgba(255, 179, 0, 0.35)", padding: 16, borderRadius: 12, marginBottom: 20, fontSize: 13, lineHeight: 1.6 }}>
          <b style={{ color: "var(--text)" }}>Getting “Required permissions are missing for the app”?</b> The token must
          be granted <b style={{ color: "var(--text)" }}>leads_retrieval</b>, <b style={{ color: "var(--text)" }}>pages_show_list</b>,{" "}
          <b style={{ color: "var(--text)" }}>pages_read_engagement</b> and <b style={{ color: "var(--text)" }}>pages_manage_metadata</b>.
          Then, in the Meta App Dashboard, give the app <b style={{ color: "var(--text)" }}>Advanced Access</b> to{" "}
          <b style={{ color: "var(--text)" }}>leads_retrieval</b> (or add yourself as a Tester while in Development mode),
          and make sure the Page is <b style={{ color: "var(--text)" }}>subscribed</b> to the app for the{" "}
          <b style={{ color: "var(--text)" }}>leadgen</b> field. This error comes from Meta’s app/token setup, not the CRM.
        </div>

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

      {/* Connection health — verify + one-click subscribe (via facebook-manage). */}
      <div className="card" style={{ background: "rgba(255,255,255,0.015)", border: "1px solid var(--border)", backdropFilter: "blur(16px)", padding: 32, boxShadow: "0 8px 32px rgba(0,0,0,0.15)", borderRadius: 16 }}>
        <h3 style={{ marginTop: 0, color: "var(--accent)", fontSize: 15, letterSpacing: "1px", textTransform: "uppercase" }}>Connection health</h3>
        <p style={{ fontSize: 14, color: "var(--muted)", marginBottom: 16, lineHeight: 1.6 }}>
          Check that your token, page subscription and lead permission are all live — and subscribe the page in one click.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: checks || connMsg ? 16 : 0 }}>
          <button
            type="button"
            onClick={runTest}
            disabled={testing || !integration}
            style={{ background: "rgba(24,119,242,0.12)", color: "#1877F2", border: "1px solid rgba(24,119,242,0.35)", padding: "10px 18px", borderRadius: 8, fontWeight: 600, cursor: testing ? "wait" : "pointer" }}
          >
            {testing ? "Testing…" : "🔍 Test connection"}
          </button>
          <button
            type="button"
            onClick={runSubscribe}
            disabled={subscribing || !integration}
            style={{ background: "linear-gradient(135deg, #1877F2, #0A52CC)", color: "white", padding: "10px 18px", borderRadius: 8, border: "none", fontWeight: 600, cursor: subscribing ? "wait" : "pointer" }}
          >
            {subscribing ? "Subscribing…" : "🔗 Auto-subscribe page"}
          </button>
          <button
            type="button"
            onClick={runPageToken}
            disabled={fixing || !integration}
            title="If you saved a User / System-User token, this converts it to the Page Access Token the webhook needs."
            style={{ background: "rgba(16,185,129,0.12)", color: "#22c55e", border: "1px solid rgba(16,185,129,0.4)", padding: "10px 18px", borderRadius: 8, fontWeight: 600, cursor: fixing ? "wait" : "pointer" }}
          >
            {fixing ? "Fixing…" : "🔧 Get Page token"}
          </button>
        </div>
        {!integration && <p style={{ fontSize: 13, color: "var(--muted)" }}>Save the Page integration above first.</p>}
        {connMsg && <div style={{ fontSize: 13, color: connMsg.startsWith("✓") ? "#22c55e" : "#f87171", marginBottom: 10 }}>{connMsg}</div>}
        {checks && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[checks.token, checks.subscription, checks.permission].filter(Boolean).map((c, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13.5 }}>
                <span style={{ fontSize: 16 }}>{c!.ok ? "✅" : "❌"}</span>
                <span style={{ color: c!.ok ? "var(--text)" : "#fca5a5" }}>{c!.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {recentLeadsCard}

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

          {/* Prove the CAPI token + dataset actually work — sends one test event. */}
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", borderTop: "1px solid var(--border)", paddingTop: 14 }}>
            <button
              type="button"
              onClick={runTestCapi}
              disabled={capiTesting}
              style={{ background: "rgba(16,185,129,0.12)", color: "#22c55e", border: "1px solid rgba(16,185,129,0.4)", padding: "10px 18px", borderRadius: 8, fontWeight: 600, cursor: capiTesting ? "wait" : "pointer" }}
            >
              {capiTesting ? "Testing…" : "🧪 Test CAPI"}
            </button>
            {capiMsg && <span style={{ fontSize: 13, color: capiMsg.startsWith("✓") ? "#22c55e" : "#f87171" }}>{capiMsg}</span>}
          </div>
        </form>
      </div>
    </div>
  );
}

function FbStat({ label, value, tone, loading }: { label: string; value: number; tone: string; loading: boolean }) {
  return (
    <div className="card" style={{ background: `${tone}0d`, border: `1px solid ${tone}22`, borderRadius: 14, padding: "16px 18px" }}>
      <div style={{ color: tone, fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</div>
      <div style={{ color: tone, fontSize: 28, fontWeight: 800, marginTop: 6 }}>{loading ? "…" : value.toLocaleString("en-IN")}</div>
    </div>
  );
}
