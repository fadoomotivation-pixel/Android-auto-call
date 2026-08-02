"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Which pipe carries this company's FOUNDER notifications — and only those.
 *
 * Deliberately not on the same card as the Cloud API setup: the Cloud API is
 * how customers are messaged and that must never look like a thing you swap.
 * This choice affects the daily pulse and nothing else, and the copy says so
 * every time, because an experimental unofficial client quietly ending up in
 * front of a lead is the one failure that cannot be undone.
 */
type Baileys = {
  base_url: string;
  status: string;
  wa_number: string | null;
  last_seen_at: string | null;
  last_error: string | null;
};

const STATUS_LOOK: Record<string, { label: string; color: string }> = {
  connected: { label: "Connected", color: "#22c55e" },
  qr: { label: "Waiting for scan", color: "#fbbf24" },
  connecting: { label: "Connecting…", color: "#60a5fa" },
  disconnected: { label: "Not connected", color: "#f87171" },
};

export function ProviderPicker({ companyId, companyName }: { companyId: string; companyName?: string | null }) {
  const supabase = createClient();
  const [provider, setProvider] = useState<"meta" | "baileys">("meta");
  const [cfg, setCfg] = useState<Baileys | null>(null);
  const [baseUrl, setBaseUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [qr, setQr] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("disconnected");
  const [waNumber, setWaNumber] = useState<string | null>(null);
  const [lastSeen, setLastSeen] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    const [{ data: integ }, { data: b }] = await Promise.all([
      supabase.from("whatsapp_integrations").select("provider").eq("company_id", companyId).maybeSingle(),
      supabase.from("whatsapp_baileys").select("base_url, status, wa_number, last_seen_at, last_error")
        .eq("company_id", companyId).maybeSingle(),
    ]);
    setProvider(integ?.provider === "baileys" ? "baileys" : "meta");
    setCfg((b as Baileys) ?? null);
    if (b?.base_url) setBaseUrl(b.base_url);
    if (b?.status) setStatus(b.status);
    setWaNumber(b?.wa_number ?? null);
    setLastSeen(b?.last_seen_at ?? null);
  }, [supabase, companyId]);

  useEffect(() => { void load(); }, [load]);

  const call = useCallback(async (action: string, extra: Record<string, unknown> = {}) => {
    const { data, error } = await supabase.functions.invoke<Record<string, unknown>>(
      "notify-provider", { body: { action, company_id: companyId, ...extra } },
    );
    if (error) return { ok: false, error: error.message } as const;
    return (data ?? { ok: false, error: "no answer" }) as { ok: boolean; error?: string } & Record<string, unknown>;
  }, [supabase, companyId]);

  const refresh = useCallback(async () => {
    const s = await call("status");
    if (!s.ok) { setErr(String(s.error ?? "")); return; }
    setErr((s.error as string) ?? null);
    setStatus(String(s.status ?? "disconnected"));
    setWaNumber((s.number as string) ?? null);
    setLastSeen((s.last_seen as string) ?? null);
    // The QR is only worth fetching while WhatsApp is actually offering one —
    // it expires in seconds, which is why this re-polls rather than showing a
    // stale square that silently stops working.
    if (s.status === "qr") {
      const q = await call("qr");
      if (q.ok) setQr((q.qr as string) ?? null);
    } else {
      setQr(null);
    }
  }, [call]);

  // Poll only while the QR is on screen or we are mid-connect. A connected
  // session does not need a request every three seconds for the rest of the day.
  useEffect(() => {
    if (provider !== "baileys" || !cfg?.base_url) return;
    const live = status === "qr" || status === "connecting";
    if (poll.current) { clearInterval(poll.current); poll.current = null; }
    if (live) poll.current = setInterval(() => void refresh(), 3000);
    return () => { if (poll.current) clearInterval(poll.current); };
  }, [provider, cfg?.base_url, status, refresh]);

  async function switchProvider(next: "meta" | "baileys") {
    setBusy(true); setMsg(null);
    const r = await call("provider", { provider: next });
    setBusy(false);
    if (!r.ok) { setMsg(String(r.error ?? "Couldn't switch.")); return; }
    setProvider(next);
    await load();
    if (next === "baileys" && cfg?.base_url) void refresh();
  }

  async function save() {
    setBusy(true); setMsg(null);
    const r = await call("save", { base_url: baseUrl, secret });
    setBusy(false);
    if (!r.ok) { setMsg(String(r.error ?? "Couldn't save.")); return; }
    setSecret("");
    setMsg("Saved.");
    await load();
    void refresh();
  }

  const look = STATUS_LOOK[status] ?? STATUS_LOOK.disconnected;
  const box: React.CSSProperties = {
    padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)",
    background: "var(--panel)", color: "var(--text)", fontSize: 13,
  };

  return (
    <div style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: 14, marginTop: 14 }}>
      <strong style={{ color: "#fff", fontSize: 14 }}>Founder notifications</strong>
      <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 4, lineHeight: 1.5 }}>
        Which WhatsApp carries {companyName ? `${companyName}'s` : "this company's"} Daily Pulse to the founder.
        Customers are always messaged on the Cloud API — this setting never touches them.
      </div>

      <div style={{ display: "flex", gap: 16, marginTop: 12, flexWrap: "wrap" }}>
        {(["meta", "baileys"] as const).map((p) => (
          <label key={p} style={{ display: "flex", gap: 7, alignItems: "flex-start", fontSize: 13, cursor: "pointer", maxWidth: 330 }}>
            <input type="radio" checked={provider === p} disabled={busy} onChange={() => void switchProvider(p)} style={{ marginTop: 3 }} />
            <span>
              <span style={{ color: "var(--text)", fontWeight: 600 }}>
                {p === "meta" ? "Meta Cloud API" : "Baileys (Experimental)"}
              </span>
              <span style={{ display: "block", color: "var(--muted)", fontSize: 12, lineHeight: 1.45 }}>
                {p === "meta"
                  ? "Official and safe. Needs the founder to message you first, or an approved template."
                  : "Your own WhatsApp account, logged in by QR. No 24-hour rule. Unofficial — use a spare number, not the one leads reply to."}
              </span>
            </span>
          </label>
        ))}
      </div>

      {provider === "baileys" && (
        <div style={{ marginTop: 14, borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 12 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://your-baileys-worker.up.railway.app" style={{ ...box, flex: "1 1 300px" }} />
            <input value={secret} onChange={(e) => setSecret(e.target.value)} type="password"
              placeholder={cfg ? "Secret (leave blank to keep)" : "Shared secret"} style={{ ...box, width: 210 }} />
            <button className="primary" onClick={() => void save()} disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </button>
          </div>

          <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, color: look.color, fontWeight: 600 }}>● {look.label}</span>
            {waNumber && <span style={{ fontSize: 12.5, color: "var(--muted)" }}>+{waNumber}</span>}
            {lastSeen && (
              <span style={{ fontSize: 12, color: "var(--muted)" }}>
                Last seen {new Date(lastSeen).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
              </span>
            )}
            <button onClick={() => void refresh()} disabled={!cfg?.base_url}
              style={{ ...box, cursor: "pointer" }}>Refresh</button>
            <button onClick={async () => { await call("reconnect"); setStatus("connecting"); void refresh(); }}
              disabled={!cfg?.base_url} style={{ ...box, cursor: "pointer" }}>Reconnect</button>
          </div>

          {qr && (
            <div style={{ marginTop: 12 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="WhatsApp QR code" width={240} height={240}
                style={{ borderRadius: 10, background: "#fff", padding: 8 }} />
              <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 6, maxWidth: 380, lineHeight: 1.5 }}>
                On the phone: WhatsApp → Settings → Linked devices → Link a device. The code refreshes on
                its own every few seconds, so scan whatever is on screen.
              </div>
            </div>
          )}

          {err && (
            <div style={{ marginTop: 10, fontSize: 12.5, color: "#fca5a5", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8, padding: "8px 10px", lineHeight: 1.5 }}>
              {err}
            </div>
          )}
        </div>
      )}

      {msg && <div style={{ marginTop: 10, fontSize: 12.5, color: msg === "Saved." ? "#22c55e" : "#f87171" }}>{msg}</div>}
    </div>
  );
}
