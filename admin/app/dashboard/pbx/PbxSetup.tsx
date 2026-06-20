"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Config = {
  pbx_type: "freeswitch" | "asterisk";
  cdr_secret: string;
  active: boolean;
} | null;

const input: React.CSSProperties = {
  padding: "10px 14px", borderRadius: 8, border: "1px solid var(--border)",
  background: "rgba(255,255,255,0.02)", color: "var(--text)", width: "100%", outline: "none",
};
const lbl: React.CSSProperties = { fontSize: 13, color: "var(--muted)", fontWeight: 500 };

export function PbxSetup({ companyId, config, cdrUrl }: { companyId: string; config: Config; cdrUrl: string }) {
  const router = useRouter();
  const [pbxType, setPbxType] = useState<"freeswitch" | "asterisk">(config?.pbx_type ?? "freeswitch");
  const [active, setActive] = useState(config?.active ?? true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  function copy(text: string, which: string) {
    navigator.clipboard.writeText(text); setCopied(which); setTimeout(() => setCopied(null), 1200);
  }

  async function save() {
    setSaving(true); setErr(null); setSaved(false);
    const supabase = createClient();
    // cdr_secret has a DB default — never overwrite on update.
    const { error } = await supabase.from("pbx_config").upsert({
      company_id: companyId, pbx_type: pbxType, active, updated_at: new Date().toISOString(),
    });
    setSaving(false);
    if (error) { setErr(error.message); return; }
    setSaved(true); router.refresh(); setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 18, padding: 24 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "end" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={lbl}>PBX type</span>
          <select style={input} value={pbxType} onChange={(e) => setPbxType(e.target.value as "freeswitch" | "asterisk")}>
            <option value="freeswitch">FreeSWITCH</option>
            <option value="asterisk">Asterisk</option>
          </select>
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 10 }}>
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          <span>Active</span>
        </label>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button className="primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
        {saved && <span style={{ color: "#16a34a", fontSize: 13 }}>Saved ✓</span>}
        {err && <span className="error" style={{ fontSize: 13 }}>{err}</span>}
      </div>

      {config?.cdr_secret ? (
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          <strong style={{ fontSize: 14 }}>Point your {pbxType === "asterisk" ? "Asterisk" : "FreeSWITCH"} hangup hook at:</strong>
          <div>
            <span style={lbl}>CDR webhook URL</span>
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              <code style={{ ...input, fontSize: 12, overflowX: "auto", whiteSpace: "nowrap" }}>{cdrUrl}</code>
              <button className="primary" type="button" onClick={() => copy(cdrUrl, "url")}>{copied === "url" ? "Copied ✓" : "Copy"}</button>
            </div>
          </div>
          <div>
            <span style={lbl}>Secret header <code>x-pbx-secret</code> 🔒</span>
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              <code style={{ ...input, fontSize: 12, overflowX: "auto", whiteSpace: "nowrap" }}>{config.cdr_secret}</code>
              <button className="primary" type="button" onClick={() => copy(config.cdr_secret, "secret")}>{copied === "secret" ? "Copied ✓" : "Copy"}</button>
            </div>
          </div>
          <p style={{ color: "var(--muted)", fontSize: 12 }}>
            Copy-paste dialplan for both PBXs (FreeSWITCH <code>record_session</code> / Asterisk <code>MixMonitor</code> + the curl hook)
            is in <code>docs/PBX_CLOUD_CALLING.md</code>. Recordings land in Google Drive with an automatic AI summary.
            Telecallers set their <b>extension</b> + <b>SIP server</b> in the app under “Office line calling.”
          </p>
        </div>
      ) : (
        <p style={{ color: "var(--muted)", fontSize: 13 }}>Save once to generate your secure CDR webhook secret.</p>
      )}
    </div>
  );
}
