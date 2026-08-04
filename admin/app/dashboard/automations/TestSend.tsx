"use client";

/**
 * Fire one automation now, and say plainly what happened.
 *
 * Testing a message used to mean waiting until 7pm tomorrow, or invoking an
 * edge function by hand with a service key. An automation nobody can test is an
 * automation nobody switches on — and worse, one whose first real run is also
 * its first run ever.
 *
 * Only two paths are offered, because only two are SAFE to fire on demand.
 * A "test" that pushes a real notification to a telecaller's phone, or messages
 * a customer, is not a test — it is the thing happening. Where no safe path
 * exists the row says so instead of showing a button that lies.
 */

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Result = { ok: boolean; text: string };

export function TestSend({
  kind, label, note, subscriberId,
}: {
  kind: "pulse" | "alert";
  label: string;
  note: string;
  /** Which recipient to send to. Required for the pulse; the alert sweep has
   *  no single target. */
  subscriberId?: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);

  const blocked = kind === "pulse" && !subscriberId;

  async function run() {
    setBusy(true);
    setRes(null);
    const supabase = createClient();
    try {
      if (kind === "pulse") {
        const { data, error } = await supabase.functions.invoke("pulse-broadcast", {
          body: { subscriber_id: subscriberId },
        });
        if (error) throw error;
        const d = data as { ok?: boolean; error?: string; via?: string; queued?: boolean };
        setRes(
          d?.ok
            ? { ok: true, text: d.queued
                ? "Held — WhatsApp was down. The drain cron will retry within five minutes."
                : `Sent via ${d.via ?? "WhatsApp"}. Check the phone.` }
            : { ok: false, text: d?.error ?? "Failed" },
        );
      } else {
        const { data, error } = await supabase.functions.invoke("founder-alerts", {
          body: { force: true },
        });
        if (error) throw error;
        const d = data as { claimed?: number; sent?: number; seeded?: number; failed?: number };
        setRes({
          ok: (d?.failed ?? 0) === 0,
          text: (d?.claimed ?? 0) === 0 && (d?.seeded ?? 0) === 0
            ? "Nothing new to alert on — every milestone has already been sent once."
            : `${d?.claimed ?? 0} new, ${d?.sent ?? 0} sent, ${d?.seeded ?? 0} recorded as baseline, ${d?.failed ?? 0} failed.`,
        });
      }
    } catch (e) {
      setRes({ ok: false, text: e instanceof Error ? e.message : "Could not run" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button
          onClick={run}
          disabled={busy || blocked}
          style={{
            fontSize: 13, fontWeight: 600, padding: "7px 15px", borderRadius: 8,
            border: "1px solid var(--accent)", cursor: blocked ? "not-allowed" : "pointer",
            background: blocked ? "transparent" : "var(--accent)",
            color: blocked ? "var(--muted)" : "#fff", opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? "Sending…" : `🧪 ${label}`}
        </button>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>
          {blocked ? "Add a recipient on Daily Pulse first — there is nobody to send to." : note}
        </span>
      </div>
      {res && (
        <div style={{
          marginTop: 9, fontSize: 12.5, padding: "8px 11px", borderRadius: 8,
          background: res.ok ? "rgba(34,197,94,0.10)" : "rgba(248,113,113,0.10)",
          color: res.ok ? "#86efac" : "#fca5a5",
        }}>
          {res.ok ? "✓ " : "✗ "}{res.text}
        </div>
      )}
    </div>
  );
}
