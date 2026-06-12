"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Status = { connected: boolean; account_email: string | null } | null;

export function RecordingSetup({ companyId, enabled }: { companyId: string; enabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.rpc("my_storage_status").then(({ data }) => {
      const row = Array.isArray(data) ? (data[0] as { connected?: boolean; account_email?: string | null } | undefined) : undefined;
      setStatus(row ? { connected: !!row.connected, account_email: row.account_email ?? null } : { connected: false, account_email: null });
    });
  }, []);

  async function toggle() {
    setBusy(true);
    const supabase = createClient();
    await supabase.from("companies").update({ recording_enabled: !enabled }).eq("id", companyId);
    setBusy(false);
    router.refresh();
  }

  const connected = status?.connected ?? false;
  const row: React.CSSProperties = { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "10px 0" };

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div className="label">Recording setup</div>

      {/* Step 1 — on/off */}
      <div style={row}>
        <strong style={{ minWidth: 150 }}>1 · Call recording</strong>
        <span className={`badge ${enabled ? "connected" : ""}`}>{enabled ? "On" : "Off"}</span>
        <button className="link" style={{ color: "var(--accent)" }} onClick={toggle} disabled={busy}>
          {busy ? "…" : enabled ? "Turn off" : "Turn on"}
        </button>
      </div>

      {/* Step 2 — storage */}
      <div style={row}>
        <strong style={{ minWidth: 150 }}>2 · Storage (Google Drive)</strong>
        {status === null ? (
          <span className="subtitle">Checking…</span>
        ) : connected ? (
          <>
            <span className="badge connected">Connected</span>
            {status?.account_email && <span className="subtitle">{status.account_email}</span>}
            <a className="link" style={{ color: "var(--accent)" }} href={`/api/gdrive/start?company=${companyId}`}>Reconnect</a>
          </>
        ) : (
          <a className="primary" style={{ width: "auto", padding: "8px 14px", textDecoration: "none" }} href={`/api/gdrive/start?company=${companyId}`}>
            Connect Google Drive
          </a>
        )}
      </div>

      {enabled && status !== null && !connected && (
        <div className="error" style={{ marginTop: 6 }}>
          ⚠ Recording is on but no storage is connected — calls won&apos;t be saved. Tap “Connect Google Drive”.
        </div>
      )}

      <p className="subtitle" style={{ margin: "10px 0 0" }}>
        Recordings are saved to your own Google Drive and auto-deleted after 30 days. Cloud (in-app) calls record
        reliably; SIM call recording depends on your phone allowing it.
      </p>
    </div>
  );
}
