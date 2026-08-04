"use client";

/**
 * "Remind" — one tap to the rep's phone, and it remembers.
 *
 * Routed through the notify-rep function that already sends hot-lead pushes,
 * NOT through a new notification path. There is exactly one way this product
 * reaches a telecaller's phone, and a second one would be a second set of
 * quiet-hours rules, a second thing to mute, and a second place to look when a
 * rep says they never got told.
 *
 * The state is written to lead_activities — the CRM's existing timeline —
 * rather than to a table of its own. A reminder is an event in a lead's
 * history exactly like a call or a status change, and a private table would
 * mean the lead's story is told in two places. It is also written rather than
 * held in the component,
 * because page-local memory is the version of this feature that causes the
 * problem it exists to prevent: refresh the dashboard, or open it on a phone
 * instead of the laptop, and every row looks untouched — so the natural move
 * is to press it again. A rep who gets four pushes about one lead stops
 * reading any of them.
 *
 * The push is sent BEFORE the log is written. If the log write fails the rep
 * has still been reminded, and the honest thing is to show that rather than
 * hide a delivered notification behind a failed insert.
 */

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

/** "2 min ago" · "10:42 AM" · "3 Aug". What a manager needs to decide whether
 *  poking again is reasonable — not a precise timestamp. */
function agoLabel(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const sameDay = new Date(iso).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" }) ===
    new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" });
  if (sameDay) {
    return new Date(iso).toLocaleTimeString("en-IN", {
      timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true,
    });
  }
  return new Date(iso).toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata", day: "numeric", month: "short",
  });
}

/** The phrase written into the activity detail, and matched when reading it
 *  back. Kept beside the reader in page.tsx — change one, change both. */
export const KIND_PHRASE: Record<"escalation" | "site_visit" | "follow_up", string> = {
  escalation: "no answer after two asks",
  site_visit: "site visit outcome",
  follow_up: "overdue callback",
};

export function RemindRep({
  userId, contactId, companyId, kind, title, message, lastRemindedAt,
}: {
  userId: string | null;
  contactId: string | null;
  companyId: string | null;
  kind: "escalation" | "site_visit" | "follow_up";
  title: string;
  message: string;
  /** The most recent reminder for this lead, from the database. Survives a
   *  refresh and is the same on every device. */
  lastRemindedAt: string | null;
}) {
  const [sentAt, setSentAt] = useState<string | null>(lastRemindedAt);
  const [state, setState] = useState<"idle" | "sending" | "error">("idle");
  const [why, setWhy] = useState<string | null>(null);

  // An unassigned lead has nobody to remind. Saying so is more useful than a
  // button that fails when pressed — the fix is to assign it, not to retry.
  if (!userId) {
    return <span style={{ fontSize: 11.5, color: "var(--muted)" }}>unassigned</span>;
  }

  async function send() {
    setState("sending");
    const supabase = createClient();
    try {
      const { error } = await supabase.functions.invoke("notify-rep", {
        body: { user_ids: [userId], contact_id: contactId ?? undefined, title, body: message },
      });
      if (error) throw error;
      const now = new Date().toISOString();
      setSentAt(now);
      setState("idle");
      // Best effort. The rep has the push either way; failing to log it must
      // not make the UI claim the reminder never happened.
      if (companyId && contactId) {
        await supabase.from("lead_activities").insert({
          company_id: companyId,
          contact_id: contactId,
          type: "reminder",
          // The queue it came from lives in the sentence, because
          // lead_activities has no typed `kind`. KIND_PHRASE is the one place
          // that mapping exists, and the page reads it back with the same map.
          detail: `Reminder sent — ${KIND_PHRASE[kind]}`,
        });
      }
    } catch (e) {
      setState("error");
      setWhy(e instanceof Error ? e.message : "Could not send");
    }
  }

  const label =
    state === "sending" ? "Sending…" :
    state === "error" ? "Retry" :
    sentAt ? "Remind again" : "Remind";

  // Status on the left, action on the right. Merging them into one green
  // button made the state read as a thing to press — easy to click by
  // accident, and hard to scan twenty rows for who has already been chased.
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      {sentAt && (
        <span style={{ fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap" }}>
          🔔 Last reminded: {agoLabel(sentAt)}
        </span>
      )}
      <button
        onClick={send}
        disabled={state === "sending"}
        title={why ?? "Send a push to this telecaller's phone"}
        style={{
          fontSize: 11.5, padding: "3px 10px", borderRadius: 7, cursor: "pointer",
          border: "1px solid rgba(255,255,255,0.14)",
          background: "rgba(255,255,255,0.05)",
          color: state === "error" ? "#fca5a5" : "var(--text)",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </button>
    </span>
  );
}
