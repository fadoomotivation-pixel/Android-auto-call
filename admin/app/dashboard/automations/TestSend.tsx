"use client";

/**
 * Two buttons, and the difference between them is the point.
 *
 * Preview builds the message from today's real CRM data and delivers it
 * nowhere. Send test puts it on a real phone. Collapsing those into one button
 * is how a founder ends up receiving four copies of the same report while
 * somebody adjusts a line — and how last_sent_at stops meaning "today's report
 * went out" and starts meaning "somebody was fiddling".
 *
 * Only the pulse and the alert sweep are offered at all. A "test" that pushes a
 * notification to a telecaller's phone, or messages a customer, is not a test —
 * it is the thing happening — so those rows get no button and say why.
 */

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Kind = "pulse" | "alert";
type Out = { ok: boolean; text: string; preview?: string | null };

export function TestSend({
  preview, send, note, subscriberId, companyId, alertKind,
}: {
  preview: Kind | null;
  send: Kind | null;
  note: string;
  /** Which recipient the pulse is built for. */
  subscriberId?: string | null;
  /** Which company the alert sweep runs for. */
  companyId?: string | null;
  /** Restrict an alert preview to one milestone. */
  alertKind?: string;
}) {
  const [busy, setBusy] = useState<"" | "preview" | "send">("");
  const [out, setOut] = useState<Out | null>(null);
  const [confirming, setConfirming] = useState(false);

  const needsSub = (k: Kind | null) => k === "pulse" && !subscriberId;
  const needsCompany = (k: Kind | null) => k === "alert" && !companyId;

  async function run(mode: "preview" | "send") {
    const kind = mode === "preview" ? preview : send;
    if (!kind) return;
    setBusy(mode);
    setOut(null);
    setConfirming(false);
    const supabase = createClient();
    try {
      if (kind === "pulse") {
        const { data, error } = await supabase.functions.invoke("pulse-broadcast", {
          body: mode === "preview"
            ? { subscriber_id: subscriberId, preview: true }
            : { subscriber_id: subscriberId },
        });
        if (error) throw error;
        const d = data as { ok?: boolean; error?: string; via?: string; queued?: boolean; preview?: string };
        if (!d?.ok) { setOut({ ok: false, text: d?.error ?? "Failed" }); return; }
        setOut(mode === "preview"
          ? { ok: true, text: "Built from today's real numbers. Nothing was sent.", preview: d.preview ?? null }
          : {
              ok: true,
              text: d.queued
                ? "Held — WhatsApp was down. The drain cron will retry within five minutes."
                : `Sent via ${d.via ?? "WhatsApp"}. Check the phone.`,
            });
      } else {
        const { data, error } = await supabase.functions.invoke("founder-alerts", {
          body: mode === "preview"
            ? { preview: true, company_id: companyId, kind: alertKind }
            : { force: true, company_id: companyId },
        });
        if (error) throw error;
        if (mode === "preview") {
          const d = data as { ok?: boolean; error?: string; preview?: string | null; note?: string };
          if (!d?.ok) { setOut({ ok: false, text: d?.error ?? "Failed" }); return; }
          setOut({
            ok: true,
            text: d.preview ? "Built from the last 24 hours of real leads. Nothing was sent." : (d.note ?? "Nothing to preview."),
            preview: d.preview ?? null,
          });
        } else {
          const d = data as { ok?: boolean; error?: string; claimed?: number; sent?: number; seeded?: number; failed?: number };
          if (d?.ok === false) { setOut({ ok: false, text: d?.error ?? "Failed" }); return; }
          setOut({
            ok: (d?.failed ?? 0) === 0,
            text: (d?.claimed ?? 0) === 0 && (d?.seeded ?? 0) === 0
              ? "Nothing new to alert on — every milestone in the last 24 hours has already been sent once."
              : `${d?.claimed ?? 0} new, ${d?.sent ?? 0} sent, ${d?.seeded ?? 0} recorded as baseline, ${d?.failed ?? 0} failed.`,
          });
        }
      }
    } catch (e) {
      setOut({ ok: false, text: e instanceof Error ? e.message : "Could not run" });
    } finally {
      setBusy("");
    }
  }

  const blockedPreview = !preview || needsSub(preview) || needsCompany(preview);
  const blockedSend = !send || needsSub(send) || needsCompany(send);
  const blockReason = needsSub(preview ?? send)
    ? "Add a recipient on Daily Pulse first — there is nobody to build this for."
    : needsCompany(preview ?? send)
      ? "Pick one company above. The sweep runs per company, never across all of them at once."
      : null;

  return (
    <div style={{ marginTop: 13, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
        {preview && (
          <button onClick={() => void run("preview")} disabled={!!busy || blockedPreview}
            style={{
              fontSize: 13, fontWeight: 600, padding: "7px 15px", borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.22)", background: "transparent",
              color: blockedPreview ? "var(--muted)" : "#fff",
              cursor: blockedPreview ? "not-allowed" : "pointer", opacity: busy === "preview" ? 0.6 : 1,
            }}>
            {busy === "preview" ? "Building…" : "👁 Preview only"}
          </button>
        )}
        {send && !confirming && (
          <button onClick={() => setConfirming(true)} disabled={!!busy || blockedSend}
            style={{
              fontSize: 13, fontWeight: 600, padding: "7px 15px", borderRadius: 8,
              border: "1px solid var(--accent)", background: blockedSend ? "transparent" : "var(--accent)",
              color: blockedSend ? "var(--muted)" : "#fff",
              cursor: blockedSend ? "not-allowed" : "pointer",
            }}>
            📤 Send test
          </button>
        )}
        {send && confirming && (
          <>
            <button onClick={() => void run("send")} disabled={!!busy}
              style={{
                fontSize: 13, fontWeight: 700, padding: "7px 15px", borderRadius: 8,
                border: "1px solid #ef4444", background: "#ef4444", color: "#fff", cursor: "pointer",
              }}>
              {busy === "send" ? "Sending…" : "Yes — send it for real"}
            </button>
            <button onClick={() => setConfirming(false)}
              style={{
                fontSize: 13, padding: "7px 13px", borderRadius: 8, cursor: "pointer",
                border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: "var(--muted)",
              }}>
              Cancel
            </button>
          </>
        )}
        <span style={{ fontSize: 12, color: "var(--muted)", flex: "1 1 240px", minWidth: 0 }}>
          {blockReason ?? (confirming ? "This goes to a real phone." : note)}
        </span>
      </div>

      {out && (
        <>
          <div style={{
            marginTop: 10, fontSize: 12.5, padding: "8px 11px", borderRadius: 8,
            background: out.ok ? "rgba(34,197,94,0.10)" : "rgba(248,113,113,0.10)",
            color: out.ok ? "#86efac" : "#fca5a5",
          }}>
            {out.ok ? "✓ " : "✗ "}{out.text}
          </div>
          {out.preview && (
            <pre style={{
              margin: "9px 0 0", whiteSpace: "pre-wrap", fontSize: 12.5, lineHeight: 1.55,
              background: "rgba(37,211,102,0.06)", border: "1px solid rgba(37,211,102,0.22)",
              borderRadius: 10, padding: "11px 13px", fontFamily: "inherit",
            }}>{out.preview}</pre>
          )}
        </>
      )}
    </div>
  );
}
