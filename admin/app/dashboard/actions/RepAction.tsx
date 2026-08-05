"use client";

/**
 * The next step, not a label.
 *
 * "Remind Rep" did one thing: push the rep's phone. That is the right default
 * and it stays exactly as it was — same function, same log row, same "last
 * reminded" memory. But it was the ONLY thing, so a manager who could see the
 * problem still had to leave the page to act on it: open WhatsApp, find the
 * rep, retype the lead's name and how late it is. Four steps to send one
 * sentence they had already read on screen.
 *
 * Now the same button opens the four things a manager actually does next, each
 * with the context already filled in — lead, company, the delay in days, the
 * rep it is assigned to. Nothing here invents a new notification path: the push
 * is still notify-rep, the callback is still a follow_ups row, and WhatsApp is
 * the manager's own phone, exactly as the rep's lead chat already is.
 *
 * WHY WHATSAPP-THE-REP CAN BE DISABLED. It needs the rep's number, and eight of
 * nine telecallers have none. Rather than a dead button, the row says so and
 * links to where it is added — the Automation Center, which is the page that
 * already reports the gap.
 */

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { istClock, istDate } from "@/lib/dashboard/format";

/** "2 min ago" · "10:42 AM" · "3 Aug". */
function agoLabel(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const sameDay = istDate(iso) === istDate(new Date().toISOString());
  return sameDay ? istClock(iso) : istDate(iso);
}

export type ReminderKind = "escalation" | "site_visit" | "follow_up";

/**
 * The sentence a person reads in the lead's timeline. DISPLAY ONLY — the kind
 * travels in `meta.kind`, so this wording can be rewritten or translated
 * tomorrow without any code noticing.
 */
const KIND_PHRASE: Record<ReminderKind, string> = {
  escalation: "no answer after two asks",
  site_visit: "site visit outcome",
  follow_up: "overdue callback",
};

/** Tomorrow 10:30 IST, as an instant. The hour a callback is actually made. */
function tomorrowMorning(): string {
  const nowIst = new Date(Date.now() + 5.5 * 3600_000);
  nowIst.setUTCDate(nowIst.getUTCDate() + 1);
  const day = nowIst.toISOString().slice(0, 10);
  return new Date(`${day}T10:30:00+05:30`).toISOString();
}

export function RepAction({
  userId, contactId, companyId, kind, title, message, lastRemindedAt,
  leadName, leadPhone, repName, repPhone, companyName, delayDays,
}: {
  userId: string | null;
  contactId: string | null;
  companyId: string | null;
  kind: ReminderKind;
  title: string;
  message: string;
  lastRemindedAt: string | null;
  leadName: string;
  leadPhone: string | null;
  repName: string | null;
  /** The telecaller's WhatsApp number, when their profile has one. */
  repPhone: string | null;
  companyName: string | null;
  delayDays: number | null;
}) {
  const [sentAt, setSentAt] = useState<string | null>(lastRemindedAt);
  const [state, setState] = useState<"idle" | "busy" | "error" | "done">("idle");
  const [why, setWhy] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  // An unassigned lead has nobody to remind. Saying so is more useful than a
  // button that fails when pressed — the fix is to assign it, not to retry.
  if (!userId) {
    return <span style={{ fontSize: 11.5, color: "var(--muted)" }}>unassigned</span>;
  }

  /** The one sentence every channel starts from, so they cannot disagree. */
  const context = [
    `${leadName}`,
    companyName ? `(${companyName})` : null,
    delayDays !== null && delayDays > 0 ? `— waiting ${delayDays} day${delayDays === 1 ? "" : "s"}` : null,
  ].filter(Boolean).join(" ");

  const waText = encodeURIComponent(
    `${repName ? `${repName}, ` : ""}${context}. ${message}`,
  );

  async function log(detail: string, extra: Record<string, unknown> = {}) {
    if (!companyId || !contactId) return;
    const supabase = createClient();
    // Best effort, and deliberately after the action: the thing happened
    // either way, and a failed insert must never make the UI claim it did not.
    await supabase.from("lead_activities").insert({
      company_id: companyId, contact_id: contactId, type: "reminder",
      detail, meta: { kind, ...extra },
    });
  }

  async function pushRep() {
    setState("busy"); setWhy(null);
    const supabase = createClient();
    try {
      const { error } = await supabase.functions.invoke("notify-rep", {
        body: { user_ids: [userId], contact_id: contactId ?? undefined, title, body: message },
      });
      if (error) throw error;
      const now = new Date().toISOString();
      setSentAt(now); setState("idle"); setOpen(false);
      await log(`Reminder sent — ${KIND_PHRASE[kind]}`, { via: "push" });
    } catch (e) {
      setState("error");
      setWhy(e instanceof Error ? e.message : "Could not send");
    }
  }

  async function bookCallback() {
    if (!companyId || !contactId) return;
    setState("busy"); setWhy(null);
    const supabase = createClient();
    const due = tomorrowMorning();
    // Written to follow_ups, the table the app's Follow-up tab already reads,
    // so a callback booked here appears on the rep's phone like any other.
    const { error } = await supabase.from("follow_ups").insert({
      company_id: companyId, contact_id: contactId, salesperson_id: userId,
      phone: leadPhone, name: leadName, due_at: due, status: "pending",
      note: `Booked from Action Center — ${KIND_PHRASE[kind]}`,
    });
    if (error) {
      setState("error");
      setWhy(error.message);
      return;
    }
    setState("done"); setOpen(false);
    await log(`Callback booked for tomorrow 10:30 — ${KIND_PHRASE[kind]}`, { via: "callback", due_at: due });
  }

  const label =
    state === "busy" ? "Working…" :
    state === "error" ? "Retry" :
    state === "done" ? "✅ Callback booked" :
    sentAt ? "🔔 Next step" : "🔔 Next step";

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, position: "relative" }}>
      {sentAt && (
        <span style={{ fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap" }}>
          🔔 Last reminded: {agoLabel(sentAt)}
        </span>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={state === "busy"}
        title={why ?? "Choose what to do about this lead"}
        style={{
          fontSize: 11.5, padding: "3px 10px", borderRadius: 7, cursor: "pointer",
          border: "1px solid rgba(255,255,255,0.14)",
          background: open ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.05)",
          color: state === "error" ? "#fca5a5" : "var(--text)",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 30,
            minWidth: 262, padding: 8, borderRadius: 11,
            background: "#141821", border: "1px solid rgba(255,255,255,0.14)",
            boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
          }}
        >
          <div style={{ fontSize: 11, color: "var(--muted)", padding: "2px 6px 7px" }}>
            {context}
            {repName ? ` · ${repName}` : ""}
          </div>

          <Item onClick={() => void pushRep()} icon="🔔"
            label={sentAt ? "Push the rep again" : "Push the rep"}
            hint="Notification on their phone, logged to the lead" />

          {repPhone ? (
            <Item as="a" href={`https://wa.me/${repPhone}?text=${waText}`} icon="💬"
              label="WhatsApp the rep"
              hint="Opens your WhatsApp, message already written"
              onClick={() => { void log("WhatsApp opened to the rep", { via: "whatsapp_rep" }); setOpen(false); }} />
          ) : (
            <div style={{ padding: "7px 6px", fontSize: 12, color: "var(--muted)" }}>
              💬 WhatsApp the rep —{" "}
              <Link href="/dashboard/automations" style={{ color: "var(--accent)" }}>
                add their number
              </Link>
            </div>
          )}

          {leadPhone && (
            <Item as="a" href={`tel:${leadPhone}`} icon="📞"
              label="Call the customer yourself"
              hint={leadPhone}
              onClick={() => { void log("Manager called the customer", { via: "call" }); setOpen(false); }} />
          )}

          <Item onClick={() => void bookCallback()} icon="📅"
            label="Book a callback for tomorrow"
            hint="10:30 AM, straight onto the rep's Follow-up tab" />

          {why && (
            <div style={{ fontSize: 11.5, color: "#fca5a5", padding: "6px 6px 2px" }}>{why}</div>
          )}
        </div>
      )}
    </span>
  );
}

function Item({
  icon, label, hint, onClick, as, href,
}: {
  icon: string; label: string; hint: string;
  onClick?: () => void;
  as?: "a"; href?: string;
}) {
  const inner = (
    <>
      <span style={{ fontSize: 13 }}>{icon} {label}</span>
      <span style={{ display: "block", fontSize: 11, color: "var(--muted)", marginTop: 1 }}>{hint}</span>
    </>
  );
  const style: React.CSSProperties = {
    display: "block", width: "100%", textAlign: "left", padding: "7px 6px",
    borderRadius: 8, border: "none", background: "transparent",
    color: "var(--text)", cursor: "pointer", textDecoration: "none",
  };
  if (as === "a") {
    return <a href={href} target="_blank" rel="noopener noreferrer" onClick={onClick} style={style}>{inner}</a>;
  }
  return <button onClick={onClick} style={style}>{inner}</button>;
}
