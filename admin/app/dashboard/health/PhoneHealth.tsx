"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { createClient } from "@/lib/supabase/client";

interface Row {
  company_id: string;
  company_name: string | null;
  record_all_calls: boolean;
  salesperson_id: string;
  rep_name: string | null;
  app_last_seen: string | null;
  calls: number;
  outgoing: number;
  incoming: number;
  missed: number;
  off_crm: number;
  connected: number;
  recordings_ready: number;
  sync_rows: number;
  last_sync_row_at: string | null;
  last_call_at: string | null;
  state: string;
}

const TONE: Record<string, string> = {
  ok: "#22c55e",
  idle: "#86868B",
  offcrm_disabled: "#f59e0b",
  no_recordings: "#f59e0b",
  sync_stale: "#ef4444",
  no_calllog_permission: "#ef4444",
};

const LABEL: Record<string, string> = {
  ok: "Working",
  idle: "No calls yet",
  offcrm_disabled: "Off-CRM off",
  no_recordings: "No recordings",
  sync_stale: "Sync stopped",
  no_calllog_permission: "Permission off",
};

const ist = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "—";

const daysAgo = (iso: string | null) =>
  iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000) : null;

/**
 * What the app can and cannot log — the whole reason this page exists.
 *
 * An OUTGOING call is written by the dialer itself the moment it dials, so it
 * always reaches the CRM. INCOMING, MISSED and OFF-CRM calls can only arrive
 * through the phone's 15-minute call-log sync, which needs Android's "Call logs"
 * permission and does nothing (silently) without it. So a phone with the
 * permission denied looks perfectly healthy — outgoing keeps flowing — while
 * every inbound call vanishes. This turns that silence into a named person and
 * one instruction the manager can forward.
 */
function verdict(r: Row): { title: string; why: string; fix: string | null } {
  const rep = (r.rep_name ?? "Telecaller").trim();
  switch (r.state) {
    case "no_calllog_permission":
      return {
        title: "Incoming aur missed calls CRM me nahi aa rahi",
        why: `${r.outgoing} outgoing calls aayi hain, par is phone se ek bhi incoming, missed ya off-CRM call kabhi nahi aayi. Outgoing call app khud likhti hai — baaki sab phone ki "Call logs" permission se aati hain. Wo permission band lag rahi hai.`,
        fix: `${rep} ke phone me: Settings → Apps → Call Pro AI → Permissions → Call logs → Allow. Phir app ek baar kholein. App update ki zaroorat nahi — 15 minute me calls apne aap aane lagengi.`,
      };
    case "sync_stale": {
      const d = daysAgo(r.last_sync_row_at);
      return {
        title: `Call sync ${d ?? "kuch"} din se band hai`,
        why: `Pehle is phone se incoming/off-CRM calls aa rahi thi (aakhri ${ist(r.last_sync_row_at)}), lekin rep abhi bhi call kar raha hai aur tab se ek bhi nahi aayi. Aam wajah: battery optimisation ne background sync band kar diya, ya permission reset ho gayi.`,
        fix: `${rep} ke phone me: Settings → Apps → Call Pro AI → Battery → Unrestricted, aur Permissions → Call logs → Allow. Phir app ek baar kholein.`,
      };
    }
    case "offcrm_disabled":
      return {
        title: "Off-CRM calls aur unki recording nahi aayengi",
        why: `Is company ka "har call record karo" band hai. Jo number CRM me lead nahi hai, uski call aur recording kabhi upload nahi hogi — chahe rep sab kuch sahi kar raha ho.`,
        fix: null, // fixed by the company toggle below, not by the rep
      };
    case "no_recordings":
      return {
        title: "Calls aa rahi hain, recording nahi",
        why: `${r.connected} calls connect hui, par sirf ${r.recordings_ready} ki recording mili. Phone ka recorder band hai ya app me recording folder select nahi hua.`,
        fix: `${rep} ke phone me: app → Recordings → "Recording folder" select karwayein (phone ke call recorder ka folder), aur phone dialer me call recording ON rakhein.`,
      };
    case "idle":
      return {
        title: "Abhi tak koi call nahi",
        why: r.app_last_seen
          ? `App chal rahi hai (aakhri baar ${ist(r.app_last_seen)}), par is window me ek bhi call nahi hui.`
          : "App is account se kabhi login nahi hui.",
        fix: null,
      };
    default:
      return {
        title: "Sab theek chal raha hai",
        why: `${r.calls} calls, ${r.incoming} incoming, ${r.off_crm} off-CRM, ${r.recordings_ready} recordings. Phone CRM ko sahi feed kar raha hai.`,
        fix: null,
      };
  }
}

export function PhoneHealth({ isSuper }: { isSuper: boolean }) {
  const supabase = createClient();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [days, setDays] = useState(14);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    const { data, error } = await supabase.rpc("call_capture_health", { p_days: days });
    if (error) { setErr(error.message); return; }
    setRows((data as Row[]) ?? []);
  }, [supabase, days]);

  useEffect(() => { void load(); }, [load]);

  // Companies whose off-CRM capture is switched off — the one setting that makes
  // a rep's non-lead calls (and their recordings) invisible no matter what.
  const offcrmCompanies = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of rows ?? []) if (!r.record_all_calls) seen.set(r.company_id, r.company_name ?? "Company");
    return [...seen].map(([id, name]) => ({ id, name }));
  }, [rows]);

  async function turnOnOffCrm(companyId: string) {
    setBusy(companyId); setErr(null);
    const { error } = await supabase.from("companies").update({ record_all_calls: true }).eq("id", companyId);
    setBusy(null);
    if (error) { setErr(error.message); return; }
    await load();
  }

  async function copyFix(r: Row) {
    const v = verdict(r);
    const text = `${r.rep_name ?? "Telecaller"} — ${v.title}\n\n${v.why}\n\n✅ ${v.fix ?? ""}`.trim();
    await navigator.clipboard.writeText(text);
    setCopied(r.salesperson_id);
    setTimeout(() => setCopied(null), 2000);
  }

  const broken = (rows ?? []).filter((r) => r.state === "no_calllog_permission" || r.state === "sync_stale");
  const warn = (rows ?? []).filter((r) => r.state === "no_recordings" || r.state === "offcrm_disabled");
  const good = (rows ?? []).filter((r) => r.state === "ok");

  const card: CSSProperties = {
    background: "var(--panel-grad, var(--panel))", border: "1px solid var(--border)",
    borderRadius: 18, padding: 18, marginBottom: 12,
  };
  const pill = (state: string): CSSProperties => ({
    fontSize: 11, fontWeight: 700, color: TONE[state] ?? "var(--muted)",
    border: `1px solid ${TONE[state] ?? "var(--border)"}`, borderRadius: 999,
    padding: "2px 9px", whiteSpace: "nowrap",
  });
  const stat: CSSProperties = { fontSize: 12.5, color: "var(--muted)" };

  const order = ["no_calllog_permission", "sync_stale", "no_recordings", "offcrm_disabled", "idle", "ok"];

  return (
    <>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", margin: "12px 0" }}>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ width: "auto" }}>
          <option value={7}>Last 7 days</option>
          <option value={14}>Last 14 days</option>
          <option value={30}>Last 30 days</option>
        </select>
        {rows && (
          <span style={{ fontSize: 13, color: "var(--muted)" }}>
            {broken.length > 0 && <><span style={{ color: "#ef4444", fontWeight: 700 }}>{broken.length} phone need fixing</span> · </>}
            {warn.length > 0 && <><span style={{ color: "#f59e0b", fontWeight: 700 }}>{warn.length} partial</span> · </>}
            <span style={{ color: "#22c55e", fontWeight: 700 }}>{good.length} healthy</span>
          </span>
        )}
        <button className="link" style={{ marginLeft: "auto" }} onClick={() => void load()}>Check again</button>
      </div>

      {err && <div className="error" style={{ marginBottom: 10 }}>{err}</div>}

      {/* Company-level switch: no rep-side fix can work while this is off. */}
      {offcrmCompanies.length > 0 && (
        <div style={{ ...card, border: "1px solid rgba(245,158,11,0.35)" }}>
          <strong style={{ color: "#fff", fontSize: 14.5 }}>⚙️ Off-CRM calling is OFF</strong>
          <p className="subtitle" style={{ margin: "4px 0 10px" }}>
            With this off, any call to a number that isn&apos;t a CRM lead — and its recording — never reaches the
            dashboard. Turn it on and the phones start uploading those calls within 15 minutes. No app update.
          </p>
          {offcrmCompanies.map((c) => (
            <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              <span style={{ color: "#fff", fontWeight: 600 }}>{c.name}</span>
              <button
                onClick={() => turnOnOffCrm(c.id)}
                disabled={busy === c.id}
                style={{ marginLeft: "auto", padding: "6px 14px", borderRadius: 999, cursor: "pointer",
                  fontSize: 12.5, fontWeight: 700, border: "1px solid #f59e0b",
                  background: "rgba(245,158,11,0.14)", color: "#f59e0b" }}>
                {busy === c.id ? "…" : "Turn ON"}
              </button>
            </div>
          ))}
        </div>
      )}

      {!rows && <div className="empty">Checking every phone…</div>}
      {rows && rows.length === 0 && <div className="empty">No telecallers to check.</div>}

      {rows && [...rows]
        .sort((a, b) => order.indexOf(a.state) - order.indexOf(b.state) || b.calls - a.calls)
        .map((r) => {
          const v = verdict(r);
          return (
            <div key={r.salesperson_id} style={card}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <span style={pill(r.state)}>{LABEL[r.state] ?? r.state}</span>
                <strong style={{ color: "#fff", fontSize: 15 }}>{r.rep_name ?? "Telecaller"}</strong>
                {isSuper && <span style={stat}>· {r.company_name ?? "Company"}</span>}
                <span style={{ ...stat, marginLeft: "auto" }}>App last seen {ist(r.app_last_seen)}</span>
              </div>

              <div style={{ color: "#fff", fontSize: 14, fontWeight: 600, marginTop: 10 }}>{v.title}</div>
              <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 4, lineHeight: 1.55 }}>{v.why}</div>

              {v.fix && (
                <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 240, background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)",
                    borderRadius: 12, padding: "10px 12px", color: "var(--text)", fontSize: 13, lineHeight: 1.55 }}>
                    ✅ {v.fix}
                  </div>
                  <button className="link" onClick={() => copyFix(r)}>
                    {copied === r.salesperson_id ? "Copied ✓" : "Copy for WhatsApp"}
                  </button>
                </div>
              )}

              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 12, ...stat }}>
                <span>📤 {r.outgoing} out</span>
                <span>📥 {r.incoming} in</span>
                <span>↩︎ {r.missed} missed</span>
                <span>👤 {r.off_crm} off-CRM</span>
                <span>🎧 {r.recordings_ready}/{r.connected} recorded</span>
                <span>🔄 last sync {ist(r.last_sync_row_at)}</span>
                <span>📞 last call {ist(r.last_call_at)}</span>
              </div>
            </div>
          );
        })}

      <p className="subtitle" style={{ marginTop: 14, lineHeight: 1.6 }}>
        <strong>How this is worked out:</strong> an outgoing call is written by the app the instant it dials, so it
        always arrives. Incoming, missed and off-CRM calls can only reach the CRM through the phone&apos;s background
        call-log sync — those rows land minutes after the call, which is how we can tell the sync is alive. Outgoing
        flowing with none of the others is the fingerprint of a denied &quot;Call logs&quot; permission.
      </p>
    </>
  );
}
