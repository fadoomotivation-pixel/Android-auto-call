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

/**
 * Who to ring first — the SAME order as the Android app (CallNowQueue.kt
 * callNowTier) and the database (v_lead_workstate.call_tier, 0236). This list
 * used to sort by due time alone, so the web and the phone showed the same
 * people in a different order:
 *
 *   0  the buyer wrote, nobody answered
 *   1  a promise from a recorded call was not kept
 *   2  someone has really spoken to them (30s+) — latest talk first
 *   3  rung under 4 times, never answered
 *   4  rung 4+ times, never answered
 *
 * Outside tier 2: oldest due time, then when the lead arrived.
 */
export function callTier(l: Lead): number {
  if (l.waiting_since) return 0;
  if (l.promise_due_since) return 1;
  if ((l.best_call_seconds ?? 0) >= 30) return 2;
  if ((l.calls_total ?? 0) < 4) return 3;
  return 4;
}

function tieKey(l: Lead): number {
  if (callTier(l) === 2) return -(l.last_call_at ? Date.parse(l.last_call_at) : 0);
  const k = l.due_at ?? l.created_at;
  return k ? Date.parse(k) : Number.MAX_SAFE_INTEGER;
}

export function callQueue(leads: Lead[], now = Date.now()): Lead[] {
  return leads.filter((l) => inChip(l, "call_now", now))
    .sort((a, b) => callTier(a) - callTier(b) || tieKey(a) - tieKey(b));
}

/** "just now" · "40m ago" · "3h ago" · "2d ago" — Android's agoLabel. */
export function agoLabel(iso: string, now = Date.now()): string {
  const min = Math.floor((now - Date.parse(iso)) / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  if (min < 1440) return `${Math.floor(min / 60)}h ago`;
  return `${Math.floor(min / 1440)}d ago`;
}

/** Why a Call now row is due, in the words Android uses (dueSignal). */
export function dueSignal(l: Lead, now = Date.now()): string | null {
  if (l.waiting_since) return `They wrote ${agoLabel(l.waiting_since, now)} — no reply yet`;
  if (l.promise_due_since && l.promise_text) return `You said: ${l.promise_text} · ${agoLabel(l.promise_due_since, now)}`;
  const calls = l.calls_total ?? 0;
  if ((l.best_call_seconds ?? 1) === 0 && calls >= 4) return `Rung ${calls} times — never picked up`;
  return null;
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
