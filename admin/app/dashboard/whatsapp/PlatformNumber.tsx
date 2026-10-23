"use client";

/**
 * Call Pro AI's own WhatsApp number — link it by QR, and it is in use.
 *
 * The platform sender used to be the worker's one login, +91 70489 17300,
 * which is Capital Brix's attendance phone. Every company's Daily Pulse went
 * out from a client's number. The worker can now hold a second sending number
 * (/p/platform), and this is the whole setup for it: tap Link, scan with the
 * Call Pro AI phone, done. notify-provider switches the platform sender over
 * only once the phone is actually connected, so no report is ever sent to a
 * login nobody has scanned yet.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { prettyNumber } from "./SendingNumbers";

type Info = {
  ok: boolean; error?: string;
  state?: "connected" | "qr" | "not_linked" | "no_platform" | "no_worker" | "worker_outdated";
  note?: string; number?: string | null; in_use?: boolean; switched?: boolean; lender_name?: string | null;
};

export function PlatformNumber() {
  const supabase = createClient();
  const [info, setInfo] = useState<Info | null>(null);
  const [linking, setLinking] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  const call = useCallback(async (action: string) => {
    const { data, error } = await supabase.functions.invoke<Info & { qr?: string | null; status?: string }>(
      "notify-provider", { body: { action } },
    );
    if (error) return { ok: false, error: error.message } as Info & { qr?: string | null };
    return data ?? { ok: false, error: "No answer." };
  }, [supabase]);

  const check = useCallback(async () => {
    const r = await call("platform_number");
    setInfo(r);
    return r;
  }, [call]);

  useEffect(() => { void check(); }, [check]);

  // While linking: fetch a fresh QR and the state every 3 seconds. The QR
  // expires in about 20 seconds, so a stale square on screen is worse than none.
  useEffect(() => {
    if (!linking) return;
    const tick = async () => {
      const r = await check();
      if (r.state === "connected") {
        setLinking(false); setQr(null);
        return;
      }
      const q = await call("platform_qr");
      setQr((q as { qr?: string | null }).qr ?? null);
    };
    void tick();
    poll.current = setInterval(() => void tick(), 3000);
    return () => { if (poll.current) clearInterval(poll.current); };
  }, [linking, check, call]);

  async function unlink() {
    if (!window.confirm("Unlink the Call Pro AI number? Reports will wait in the queue until a phone is scanned again.")) return;
    setBusy(true);
    await call("platform_unlink");
    setBusy(false);
    setLinking(true);
  }

  const muted: React.CSSProperties = { color: "var(--muted)", fontSize: "var(--text-footnote)", lineHeight: 1.5 };

  return (
    <div style={{ borderTop: "1px solid var(--border)", marginTop: 12, paddingTop: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <strong style={{ color: "var(--text)", fontSize: "var(--text-subheadline)" }}>Call Pro AI number</strong>
        {info?.state === "connected" && (
          <span style={{ color: "var(--good)", fontSize: "var(--text-footnote)", fontWeight: "var(--weight-semibold)" }}>
            ● Connected · {prettyNumber(info.number) ?? "linked"}
          </span>
        )}
      </div>

      {!info && <div style={muted}>Checking…</div>}

      {info && !info.ok && <div style={{ ...muted, color: "var(--bad)" }}>{info.error}</div>}

      {info?.ok && (info.state === "no_platform" || info.state === "no_worker" || info.state === "worker_outdated") && (
        <div style={{ ...muted, color: "var(--warn)" }}>{info.note}</div>
      )}

      {info?.state === "connected" && (
        <div style={muted}>
          {info.in_use
            ? <>Every company without its own number gets its Daily Pulse and alerts from this number. Capital Brix attendance keeps its own phone.</>
            : <>Linked, switching reports over…</>}
          {info.switched && <div style={{ color: "var(--good)" }}>Switched just now. Reports go from this number from now on.</div>}
          <button className="link" onClick={() => void unlink()} disabled={busy} style={{ marginTop: 4 }}>
            Unlink this phone
          </button>
        </div>
      )}

      {info?.ok && (info.state === "not_linked" || info.state === "qr") && !linking && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
          <div style={muted}>
            Link Call Pro AI&apos;s own WhatsApp so reports stop going out from a client&apos;s phone. You need the
            Call Pro AI phone in your hand.
          </div>
          <button className="primary" onClick={() => setLinking(true)}>Link with QR</button>
        </div>
      )}

      {linking && (
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start", marginTop: 8 }}>
          {qr
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={qr} alt="WhatsApp QR code for the Call Pro AI number" width={220} height={220} style={{ borderRadius: 12, background: "var(--panel)", padding: 8 }} />
            : <div style={{ ...muted, width: 220 }}>Getting a QR…</div>}
          <ol style={{ ...muted, margin: 0, paddingLeft: 18, maxWidth: 320 }}>
            <li>On the Call Pro AI phone, open WhatsApp.</li>
            <li>Tap ⋮ (or Settings) → Linked devices → Link a device.</li>
            <li>Point the camera at this code. It changes every few seconds; scan whatever is showing.</li>
            <li>This turns green by itself. Nothing else to do.</li>
          </ol>
          <button className="link" onClick={() => { setLinking(false); setQr(null); }}>Cancel</button>
        </div>
      )}
    </div>
  );
}
