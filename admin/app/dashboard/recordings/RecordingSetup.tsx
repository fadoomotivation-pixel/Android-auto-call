"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Status = { connected: boolean; account_email: string | null } | null;

export function RecordingSetup({ companyId, enabled, recordAll }: { companyId: string; enabled: boolean; recordAll: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [busyAll, setBusyAll] = useState(false);
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

  async function toggleAll() {
    // Enabling company-wide call monitoring is a real decision — confirm it,
    // and remind the admin to disclose it to staff (the app already shows a
    // notice, but consent is the company's legal responsibility).
    if (!recordAll && !confirm(
      "Turn on record-ALL-calls?\n\nEvery call on your telecallers' work phones — including numbers NOT in the CRM — will be synced and recorded. The app shows each telecaller a monitoring notice, but telling your staff and getting their consent is your responsibility.\n\nContinue?",
    )) return;
    setBusyAll(true);
    const supabase = createClient();
    await supabase.from("companies").update({ record_all_calls: !recordAll }).eq("id", companyId);
    setBusyAll(false);
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
        <strong style={{ minWidth: 150 }}>2 · Storage (optional)</strong>
        {status === null ? (
          <span className="subtitle">Checking…</span>
        ) : connected ? (
          <>
            <span className="badge connected">Own Drive connected</span>
            {status?.account_email && <span className="subtitle">{status.account_email}</span>}
            <a className="link" style={{ color: "var(--accent)" }} href={`/api/gdrive/start?company=${companyId}`}>Reconnect</a>
          </>
        ) : (
          <>
            <span className="badge connected">Saving already</span>
            <a className="link" style={{ color: "var(--accent)" }} href={`/api/gdrive/start?company=${companyId}`}>
              Use our own Google Drive instead
            </a>
          </>
        )}
      </div>

      {/* This step used to shout "calls won't be saved" whenever a company had no
          Drive of its own, which is simply not true — uploads fall back to the
          platform Drive and then to built-in storage. That warning is why six
          separate Drives ended up connected for something that only ever needed
          one. Connecting your own Drive is a choice about WHERE the files live,
          never about whether recording works. */}
      {status !== null && !connected && (
        <p className="subtitle" style={{ margin: "6px 0 0" }}>
          Nothing to set up — recordings are already being saved and are playable from the
          Calls page. Connect a Drive here only if this company wants the audio files kept
          in its <em>own</em> Google account.
        </p>
      )}

      {/* Step 3 — record ALL calls (anti-theft monitoring) */}
      <div style={row}>
        <strong style={{ minWidth: 150 }}>3 · Record ALL calls</strong>
        <span className={`badge ${recordAll ? "connected" : ""}`}>{recordAll ? "On" : "Off"}</span>
        <button className="link" style={{ color: "var(--accent)" }} onClick={toggleAll} disabled={busyAll}>
          {busyAll ? "…" : recordAll ? "Turn off" : "Turn on"}
        </button>
      </div>
      {recordAll && (
        <p className="subtitle" style={{ margin: "4px 0 0" }}>
          Monitoring is ON: every call on your reps&apos; work phones is synced, including
          numbers not in the CRM (shown as <strong>Off-CRM</strong>). Each telecaller sees
          a monitoring notice in their app. Disclose this to your staff.
        </p>
      )}

      <p className="subtitle" style={{ margin: "10px 0 0" }}>
        Recordings go to this company&apos;s own Google Drive if one is connected above, otherwise to the
        platform Drive in its own folder — either way they play from the Calls page and are auto-deleted
        after 30 days. Cloud (in-app) calls record reliably; SIM call recording depends on your phone allowing it.
      </p>
    </div>
  );
}
