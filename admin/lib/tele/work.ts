// Which list a lead is in, for the /app web app. Same answers as the Android
// app, because the answer comes from the same place: v_lead_workstate's
// action_state, computed by the database. The one thing done here is keep the
// clock moving between refreshes — a callback booked for 3 PM is in Call now at
// 3 PM, not whenever the list happens to reload (Android: rememberNowTick).
import type { Lead } from "./types";

export type Act = "call_now" | "overdue" | "due_today" | "scheduled" | "awaiting_visit" | "no_next_step" | "none" | "";
export type Chip = "call_now" | "overdue" | "due_today" | "scheduled" | "awaiting_visit" | "no_next_step" | "all";

/** Same words as Android's ACTIONS (ui/TelecallerScreens.kt). */
export const CHIPS: { id: Chip; label: string; explain: string }[] = [
  { id: "call_now", label: "Call now", explain: "Everyone to ring now. Late callbacks, brand-new leads, and numbers nobody picked up. One list." },
  { id: "overdue", label: "Overdue", explain: "Already inside Call now. Only the ones whose booked time has passed." },
  { id: "due_today", label: "Due today", explain: "Booked for later today. They come to Call now on their own, at their time." },
  { id: "scheduled", label: "Later", explain: "Booked for another day. Nothing to do now." },
  { id: "awaiting_visit", label: "Visit", explain: "Site visit is booked. Waiting for them to come." },
  { id: "no_next_step", label: "No step", explain: "You talked to them but nothing is booked. These go cold if you leave them." },
  { id: "all", label: "All", explain: "Every lead that is yours, latest first." },
];

const dayStart = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

/** action_state, moved forward by the clock if a booked time has arrived. */
export function act(l: Lead, now = Date.now()): Act {
  const s = (l.action_state ?? "") as Act;
  if ((s === "due_today" || s === "scheduled") && l.due_at) {
    const due = Date.parse(l.due_at);
    if (due <= now) return due < dayStart(now) ? "overdue" : "call_now";
    if (s === "scheduled" && due < dayStart(now) + 86400000) return "due_today";
  }
  return s;
}

/** Call now holds Overdue, exactly as on Android. */
export function inChip(l: Lead, chip: Chip, now = Date.now()): boolean {
  const a = act(l, now);
  if (chip === "all") return true;
  if (chip === "call_now") return a === "call_now" || a === "overdue";
  return a === chip;
}

/** Who to ring first: late callbacks oldest first, then callbacks now due,
 *  then everyone else in Call now (new leads, missed calls) latest first. */
export function callQueue(leads: Lead[], now = Date.now()): Lead[] {
  const due = (l: Lead) => (l.due_at ? Date.parse(l.due_at) : Infinity);
  const upd = (l: Lead) => (l.updated_at ? Date.parse(l.updated_at) : 0);
  return leads.filter((l) => inChip(l, "call_now", now)).sort((a, b) => {
    const da = due(a), db = due(b);
    if (da !== db) return da - db;
    return upd(b) - upd(a);
  });
}

// ── Follow Ups: three groups, one clock (CLAUDE.md) ─────────────────────────
// Call now      — booked time has come, or a callback with no time at all.
// Done today    — the rep recorded an outcome today and the next call is later.
// Booked later  — everything else that has a time.
// Mutually exclusive; due always beats done. ONLY Call now is counted on the
// tab and on Home, because finishing a callback books the next one, and a total
// that never goes down is how a rep stopped believing the number.
export type FuGroup = "now" | "done" | "later";

export function fuGroup(l: Lead, now = Date.now()): FuGroup | null {
  if (act(l, now) === "none") return null; // closed lead
  const due = l.due_at ? Date.parse(l.due_at) : null;
  if (due === null) return l.status === "follow_up" || l.status === "callback" ? "now" : null;
  if (due <= now) return "now";
  return l.handled_today ? "done" : "later";
}

export function lateBy(iso: string, now = Date.now()): string | null {
  const m = Math.floor((now - Date.parse(iso)) / 60000);
  if (m < 5) return null;
  if (m < 60) return `${m} min late`;
  if (m < 1440) return `${Math.floor(m / 60)} h late`;
  return `${Math.floor(m / 1440)} d late`;
}

/** Quick picks for "When will you call again?" — Android's list. */
export function callbackPicks(now = new Date()): { label: string; at: Date }[] {
  const at = (days: number, h: number, m = 0) => { const d = new Date(now); d.setDate(d.getDate() + days); d.setHours(h, m, 0, 0); return d; };
  return [
    { label: "In 1 hour", at: new Date(now.getTime() + 3600000) },
    { label: "In 3 hours", at: new Date(now.getTime() + 3 * 3600000) },
    { label: "Tomorrow 10 AM", at: at(1, 10) },
    { label: "Tomorrow 4 PM", at: at(1, 16) },
    { label: "In 2 days, 11 AM", at: at(2, 11) },
    { label: "Next week", at: at(7, 10) },
  ];
}

/** Quick picks for "When is the site visit?" — visits happen on weekends most. */
export function visitPicks(now = new Date()): { label: string; at: Date }[] {
  const next = (dow: number) => { const d = new Date(now); d.setDate(d.getDate() + (((dow - d.getDay() + 7) % 7) || 7)); d.setHours(11, 0, 0, 0); return d; };
  const tmr = new Date(now); tmr.setDate(tmr.getDate() + 1); tmr.setHours(11, 0, 0, 0);
  return [
    { label: "Tomorrow 11 AM", at: tmr },
    { label: "Saturday 11 AM", at: next(6) },
    { label: "Sunday 11 AM", at: next(0) },
  ];
}
