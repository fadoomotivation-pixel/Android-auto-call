"use client";

/**
 * "Remind" — one tap, straight to the rep's phone.
 *
 * Routed through the notify-rep function that already sends hot-lead pushes,
 * NOT through a new notification path. There is exactly one way this product
 * reaches a telecaller's phone, and a second one would be a second set of
 * quiet-hours rules, a second thing to mute, and a second place to look when
 * a rep says they never got told.
 *
 * The button remembers it was pressed for the rest of the page's life. The
 * super admin scanning twenty overdue rows needs to see which ones they have
 * already poked — without that, the honest response to an unclear list is to
 * poke everything twice, and a rep who gets four identical pushes about the
 * same lead stops reading any of them.
 */

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function RemindRep({
  userId, contactId, title, message,
}: {
  userId: string | null;
  contactId: string | null;
  title: string;
  message: string;
}) {
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [why, setWhy] = useState<string | null>(null);

  // An unassigned lead has nobody to remind. Saying so is more useful than a
  // button that fails when pressed — the fix is to assign it, not to retry.
  if (!userId) {
    return <span style={{ fontSize: 11.5, color: "var(--muted)" }}>unassigned</span>;
  }

  async function send() {
    setState("sending");
    try {
      const supabase = createClient();
      const { error } = await supabase.functions.invoke("notify-rep", {
        body: {
          user_ids: [userId],
          contact_id: contactId ?? undefined,
          title,
          body: message,
        },
      });
      if (error) throw error;
      setState("done");
    } catch (e) {
      setState("error");
      setWhy(e instanceof Error ? e.message : "Could not send");
    }
  }

  const label =
    state === "done" ? "✓ Reminded" :
    state === "sending" ? "Sending…" :
    state === "error" ? "Retry" : "Remind";

  return (
    <button
      onClick={send}
      disabled={state === "sending" || state === "done"}
      title={why ?? "Send a push to this telecaller's phone"}
      style={{
        fontSize: 11.5, padding: "3px 10px", borderRadius: 7, cursor: state === "done" ? "default" : "pointer",
        border: "1px solid rgba(255,255,255,0.14)",
        background: state === "done" ? "rgba(34,197,94,0.14)" : "rgba(255,255,255,0.05)",
        color: state === "done" ? "#86efac" : state === "error" ? "#fca5a5" : "var(--text)",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );
}
