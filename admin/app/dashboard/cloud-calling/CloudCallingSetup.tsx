"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { CompanyIntegration, Profile, UroAgent, UroCallerId } from "@/lib/types";

type Member = Pick<Profile, "id" | "full_name" | "sip_agent_id" | "caller_id" | "sip_server" | "sip_port">;

const input: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "var(--panel-2)",
  color: "var(--text)",
  width: "100%",
};
const field: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 4, minWidth: 0 };
const lbl: React.CSSProperties = { fontSize: 12, color: "var(--muted)" };

export function CloudCallingSetup({
  companyId,
  companyName,
  integration,
  members,
}: {
  companyId: string;
  companyName: string;
  integration: CompanyIntegration | null;
  members: Member[];
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    uro_token: integration?.uro_token ?? "",
    uro_tenant_id: integration?.uro_tenant_id ?? "",
    default_caller_id: integration?.default_caller_id ?? "",
    sip_server: integration?.sip_server ?? "sip.uroperator.com",
    sip_port: String(integration?.sip_port ?? 6060),
    transport: integration?.transport ?? "udp",
    wss_url: integration?.wss_url ?? "",
    outbound_proxy: integration?.outbound_proxy ?? "",
    api_base_url: integration?.api_base_url ?? "https://api.uroperator.com",
  });
  const [savingCfg, setSavingCfg] = useState(false);
  const [cfgSaved, setCfgSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [agents, setAgents] = useState<UroAgent[]>([]);
  const [callerIds, setCallerIds] = useState<UroCallerId[]>([]);
  const [loadingLists, setLoadingLists] = useState(false);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function saveConfig() {
    setSavingCfg(true);
    setCfgSaved(false);
    const supabase = createClient();
    await supabase.from("company_integrations").upsert({
      company_id: companyId,
      uro_token: form.uro_token.trim() || null,
      uro_tenant_id: form.uro_tenant_id.trim() || null,
      default_caller_id: form.default_caller_id.trim() || null,
      sip_server: form.sip_server.trim() || "sip.uroperator.com",
      sip_port: Number(form.sip_port) || 6060,
      transport: form.transport.trim() || "udp",
      wss_url: form.wss_url.trim() || null,
      outbound_proxy: form.outbound_proxy.trim() || null,
      api_base_url: form.api_base_url.trim() || "https://api.uroperator.com",
      updated_at: new Date().toISOString(),
    });
    setSavingCfg(false);
    setCfgSaved(true);
    router.refresh();
    setTimeout(() => setCfgSaved(false), 1500);
  }

  async function testConnection() {
    setTesting(true);
    setTestResult(null);
    const supabase = createClient();
    const { data, error } = await supabase.functions.invoke<{
      ok: boolean;
      token?: { client_name?: string; tenant_id?: number; expires_at?: string } | null;
      status?: Record<string, string>;
      error?: string | null;
    }>("uro-admin", { body: { action: "test", company_id: companyId } });
    setTesting(false);
    if (error || !data?.ok) {
      setTestResult({ ok: false, msg: data?.error || error?.message || "Connection failed. Check the token." });
      return;
    }
    const t = data.token;
    const sip = data.status?.sip_server ?? "?";
    setTestResult({
      ok: true,
      msg: `Connected ✓ ${t?.client_name ? `(${t.client_name})` : ""} · tenant ${t?.tenant_id ?? "?"} · SIP ${sip}` +
        (t?.expires_at ? ` · token valid to ${new Date(t.expires_at).toLocaleDateString()}` : ""),
    });
  }

  async function loadLists() {
    setLoadingLists(true);
    const supabase = createClient();
    const [a, c] = await Promise.all([
      supabase.functions.invoke<{ ok: boolean; agents?: UroAgent[]; sip_server?: string; sip_port?: number; error?: string }>(
        "uro-admin", { body: { action: "agents", company_id: companyId } }),
      supabase.functions.invoke<{ ok: boolean; caller_ids?: UroCallerId[] }>(
        "uro-admin", { body: { action: "caller-ids", company_id: companyId } }),
    ]);
    if (a.data?.ok) {
      setAgents(a.data.agents ?? []);
      // If UrOperator reports server details and ours are still defaults, surface them.
      if (a.data.sip_server) set("sip_server", a.data.sip_server);
      if (a.data.sip_port) set("sip_port", String(a.data.sip_port));
    }
    if (c.data?.ok) setCallerIds(c.data.caller_ids ?? []);
    setLoadingLists(false);
  }

  const configured = !!integration?.uro_token;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Step 1 — connection */}
      <div className="card">
        <div className="label">1 · UrOperator account</div>
        <p className="subtitle" style={{ margin: "6px 0 14px" }}>
          Paste the <strong>FS_ token</strong>, <strong>tenant ID</strong> and default <strong>number (DID)</strong> that
          UrOperator gave you for {companyName}. The token is stored securely server-side — your telecallers never see it.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
          <label style={field}>
            <span style={lbl}>API token (FS_…)</span>
            <input style={input} value={form.uro_token} onChange={(e) => set("uro_token", e.target.value)} placeholder="FS_xxxxxxxx" />
          </label>
          <label style={field}>
            <span style={lbl}>Tenant ID</span>
            <input style={input} value={form.uro_tenant_id} onChange={(e) => set("uro_tenant_id", e.target.value)} placeholder="9" />
          </label>
          <label style={field}>
            <span style={lbl}>Default number / DID</span>
            <input style={input} value={form.default_caller_id} onChange={(e) => set("default_caller_id", e.target.value)} placeholder="+9162…" />
          </label>
          <label style={field}>
            <span style={lbl}>API base URL</span>
            <input style={input} value={form.api_base_url} onChange={(e) => set("api_base_url", e.target.value)} />
          </label>
        </div>

        <div className="label" style={{ marginTop: 16 }}>SIP server (for the in-app softphone)</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginTop: 8 }}>
          <label style={field}>
            <span style={lbl}>SIP server</span>
            <input style={input} value={form.sip_server} onChange={(e) => set("sip_server", e.target.value)} />
          </label>
          <label style={field}>
            <span style={lbl}>SIP port</span>
            <input style={input} value={form.sip_port} onChange={(e) => set("sip_port", e.target.value)} />
          </label>
          <label style={field}>
            <span style={lbl}>Transport</span>
            <select style={input} value={form.transport} onChange={(e) => set("transport", e.target.value)}>
              <option value="udp">UDP</option>
              <option value="tcp">TCP</option>
              <option value="tls">TLS</option>
            </select>
          </label>
          <label style={field}>
            <span style={lbl}>Outbound proxy (optional)</span>
            <input style={input} value={form.outbound_proxy} onChange={(e) => set("outbound_proxy", e.target.value)} placeholder="103.167.98.166:6060" />
          </label>
          <label style={field}>
            <span style={lbl}>WSS URL (browser WebRTC, optional)</span>
            <input style={input} value={form.wss_url} onChange={(e) => set("wss_url", e.target.value)} placeholder="wss://sip.uroperator.com:8843" />
          </label>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 16, flexWrap: "wrap" }}>
          <button className="primary" style={{ width: "auto", padding: "9px 16px" }} onClick={saveConfig} disabled={savingCfg}>
            {savingCfg ? "Saving…" : cfgSaved ? "Saved ✓" : "Save settings"}
          </button>
          <button className="link" style={{ color: "var(--accent)" }} onClick={testConnection} disabled={testing || !configured}>
            {testing ? "Testing…" : "Test connection"}
          </button>
          <span className={`badge ${configured ? "connected" : "new"}`}>{configured ? "configured" : "not set"}</span>
          {testResult && (
            <span style={{ color: testResult.ok ? "var(--accent)" : "var(--danger, #e5484d)", fontSize: 13 }}>{testResult.msg}</span>
          )}
        </div>
        {!configured && (
          <p className="subtitle" style={{ margin: "10px 0 0" }}>Save the token first, then Test connection.</p>
        )}
      </div>

      {/* Step 2 — assignment */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <div className="label">2 · Assign extensions &amp; numbers to telecallers</div>
          <button className="link" style={{ color: "var(--accent)" }} onClick={loadLists} disabled={loadingLists || !configured}>
            {loadingLists ? "Loading…" : "Load agents & numbers from UrOperator"}
          </button>
        </div>
        <p className="subtitle" style={{ margin: "6px 0 14px" }}>
          {agents.length > 0
            ? `${agents.length} agent(s) and ${callerIds.length} number(s) found on UrOperator — pick from the dropdowns.`
            : "Tip: load the lists above to pick from real extensions/numbers, or just type them in."}
        </p>

        {members.length === 0 ? (
          <div className="empty">No telecallers yet. Invite them from the Salespeople page first.</div>
        ) : (
          <div className="table-responsive">
<table>
            <thead>
              <tr>
                <th>Telecaller</th>
                <th>Agent extension</th>
                <th>Caller ID (DID)</th>
                <th>SIP server override</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <AgentRow key={m.id} member={m} agents={agents} callerIds={callerIds} defaultCallerId={form.default_caller_id} />
              ))}
            </tbody>
          </table>
</div>
        )}
      </div>
    </div>
  );
}

function AgentRow({
  member,
  agents,
  callerIds,
  defaultCallerId,
}: {
  member: Member;
  agents: UroAgent[];
  callerIds: UroCallerId[];
  defaultCallerId: string;
}) {
  const router = useRouter();
  const [ext, setExt] = useState(member.sip_agent_id ?? "");
  const [cid, setCid] = useState(member.caller_id ?? "");
  const [server, setServer] = useState(member.sip_server ?? "");
  const [port, setPort] = useState(member.sip_port ? String(member.sip_port) : "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setBusy(true);
    setSaved(false);
    const supabase = createClient();
    await supabase
      .from("profiles")
      .update({
        sip_agent_id: ext.trim() || null,
        caller_id: cid.trim() || null,
        sip_server: server.trim() || null,
        sip_port: port.trim() ? Number(port) : null,
      })
      .eq("id", member.id);
    setBusy(false);
    setSaved(true);
    router.refresh();
    setTimeout(() => setSaved(false), 1500);
  }

  const cell: React.CSSProperties = { ...input, width: "auto", minWidth: 120 };

  return (
    <tr>
      <td>{member.full_name || "—"}</td>
      <td>
        {agents.length > 0 ? (
          <input list={`agents-${member.id}`} style={cell} value={ext} onChange={(e) => setExt(e.target.value)} placeholder="ext" />
        ) : (
          <input style={cell} value={ext} onChange={(e) => setExt(e.target.value)} placeholder="ext" />
        )}
        <datalist id={`agents-${member.id}`}>
          {agents.map((a) => (
            <option key={a.username} value={a.username}>{a.name ? `${a.username} — ${a.name}` : a.username}</option>
          ))}
        </datalist>
      </td>
      <td>
        <input list={`dids-${member.id}`} style={cell} value={cid} onChange={(e) => setCid(e.target.value)} placeholder={defaultCallerId || "caller ID"} />
        <datalist id={`dids-${member.id}`}>
          {callerIds.map((d) => (
            <option key={d.did} value={d.did}>{d.name ? `${d.did} — ${d.name}` : d.did}</option>
          ))}
        </datalist>
      </td>
      <td>
        <div style={{ display: "flex", gap: 6 }}>
          <input style={{ ...cell, minWidth: 120 }} value={server} onChange={(e) => setServer(e.target.value)} placeholder="(default)" />
          <input style={{ ...cell, minWidth: 64, width: 64 }} value={port} onChange={(e) => setPort(e.target.value)} placeholder="port" />
        </div>
      </td>
      <td>
        <button className="link" style={{ color: "var(--accent)" }} onClick={save} disabled={busy}>
          {busy ? "…" : saved ? "Saved ✓" : "Save"}
        </button>
      </td>
    </tr>
  );
}

