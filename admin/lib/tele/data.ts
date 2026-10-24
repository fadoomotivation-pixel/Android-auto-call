"use client";
// Telecaller PWA data layer. Every read and write here mirrors the Android
// Repository.kt (same tables, same columns, same retry ladder) so a lead touched
// in the browser looks exactly like one touched in the app. No new business logic.
import { createClient } from "@/lib/supabase/client";
import type { ScanRow } from "./scanParser";

import type { DayPlan, Lead } from "./types";
export type { DayPlan, Lead };
export type Stage = { code: string; label: string; sort_order: number; is_terminal: boolean; rep_visible: boolean };
export type FollowUp = { id: string; contact_id: string | null; phone: string | null; name: string | null; due_at: string; note: string | null };
export type Profile = { id: string; company_id: string | null; full_name: string | null; role: string | null };
export type Today = { calls: number; connected: number; visits: number };

export type Lane = "call_now" | "scheduled" | "win_back";

export function laneOf(l: Lead): Lane | null {
  const s = l.action_state;
  if (s === "overdue" || s === "call_now") return "call_now";
  if (s === "due_today" || s === "scheduled" || s === "awaiting_visit") return "scheduled";
  if (s === "no_next_step" || isReviveLead(l)) return "win_back";
  return null;
}

/** Same rule as Android isReviveLead. */
export function isReviveLead(l: Lead): boolean {
  if (l.status === "lost" || l.status === "not_interested") return true;
  return l.temperature === "cold" && (l.attempts ?? 0) >= 2 && l.status !== "booked" && l.status !== "dnc";
}

export const OUTCOMES: { code: string; label: string; connected: boolean }[] = [
  { code: "interested", label: "Interested", connected: true },
  { code: "follow_up", label: "Call back", connected: true },
  { code: "site_visit", label: "Site visit", connected: true },
  { code: "no_answer", label: "No answer", connected: false },
  { code: "busy", label: "Busy", connected: false },
  { code: "not_interested", label: "Not interested", connected: true },
  { code: "wrong_person", label: "Wrong person", connected: true },
  { code: "invalid", label: "Wrong number", connected: false },
];

const RETRY = new Set(["no_answer", "busy", "wrong_person"]);

function outcomeDetail(code: string, stageLabel: string): [string, string] {
  switch (code) {
    case "no_answer": return ["call", "No answer"];
    case "busy": return ["call", "Busy"];
    case "wrong_person": return ["call", "Wrong person answered"];
    case "invalid": return ["status", "Bad number — wrong number"];
    default: return ["status", `Stage → ${stageLabel}`];
  }
}

/** Android nextAttemptMillis: +1 day (+2 from the 2nd try), 5 PM if before 2 PM else 11:15 AM. */
export function nextAttempt(tries: number, now = new Date()): Date {
  const d = new Date(now);
  const before2 = now.getHours() < 14;
  d.setDate(d.getDate() + (tries >= 2 ? 2 : 1));
  if (before2) d.setHours(17, 0, 0, 0); else d.setHours(11, 15, 0, 0);
  return d;
}

/** "Saved" on screen must mean saved. supabase-js returns errors instead of
 *  throwing, so a write that is not passed through here fails in silence. */
function must<T extends { error: { message: string } | null }>(r: T): T {
  if (r.error) throw new Error(r.error.message);
  return r;
}

export async function getProfile(): Promise<Profile | null> {
  const sb = createClient();
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return null;
  const { data } = await sb.from("profiles").select("id, company_id, full_name, role").eq("id", u.user.id).maybeSingle();
  return (data as Profile) ?? null;
}

export async function loadLeads(uid: string): Promise<Lead[]> {
  const sb = createClient();
  const [{ data: c }, { data: w }] = await Promise.all([
    sb.from("contacts").select("id, name, phone, status, temperature, attempts, notes, company_name, updated_at")
      .eq("salesperson_id", uid).order("updated_at", { ascending: false }).limit(1000),
    // The same columns Android reads (Repository.fetchWorkStates), so Call now
    // is ordered by the same rule on both — see callQueue in work.ts.
    sb.from("v_lead_workstate").select("contact_id, action_state, due_at, last_call_at, handled_today, stage, created_at, calls_total, best_call_seconds, waiting_since, promise_due_since, promise_text")
      .eq("salesperson_id", uid).limit(2000),
  ]);
  const ws = new Map<string, any>((w ?? []).map((r: any) => [r.contact_id, r]));
  return (c ?? []).map((r: any) => {
    const x = ws.get(r.id);
    return { ...r, attempts: r.attempts ?? 0, ...(x ? { action_state: x.action_state, due_at: x.due_at,
      last_call_at: x.last_call_at, handled_today: x.handled_today, stage: x.stage, created_at: x.created_at,
      calls_total: x.calls_total, best_call_seconds: x.best_call_seconds, waiting_since: x.waiting_since,
      promise_due_since: x.promise_due_since, promise_text: x.promise_text } : {}) };
  });
}

/** Her plan for the day: rep_plan(), the function her evening WhatsApp and the
 *  Android app read. Null when it cannot be read — the lists are left out, not
 *  shown as zero. */
export async function loadPlan(uid: string): Promise<DayPlan | null> {
  const { data, error } = await createClient().rpc("rep_plan", { p_rep: uid, p_limit: 200 });
  if (error || !data) return null;
  return data as DayPlan;
}

/** Approve & send: the message a call wrote, with her edits, from her own
 *  linked WhatsApp. The server checks it is her draft, to her own lead.
 *  fallback = her WhatsApp is not linked; open WhatsApp with the text instead. */
export async function sendDraft(draftId: string, body: string): Promise<{ ok: boolean; fallback?: boolean; error?: string }> {
  const { data, error } = await createClient().functions.invoke("follow-up-draft", {
    body: { draft_id: draftId, action: "send", body },
  });
  if (error) return { ok: false, fallback: true, error: error.message };
  return (data ?? { ok: false, fallback: true }) as { ok: boolean; fallback?: boolean; error?: string };
}

export async function loadStages(): Promise<Stage[]> {
  const { data } = await createClient().from("lead_stages")
    .select("code, label, sort_order, is_terminal, rep_visible").order("sort_order");
  return (data as Stage[]) ?? [];
}

export async function loadFollowUps(uid: string): Promise<FollowUp[]> {
  const { data } = await createClient().from("follow_ups")
    .select("id, contact_id, phone, name, due_at, note")
    .eq("salesperson_id", uid).eq("status", "pending").order("due_at");
  return (data as FollowUp[]) ?? [];
}

/** IST day start, as the Android home rings use. */
function istDayStart(): string {
  const now = Date.now(), off = 330 * 60000;
  const ist = new Date(now + off);
  ist.setUTCHours(0, 0, 0, 0);
  return new Date(ist.getTime() - off).toISOString();
}

export async function loadToday(uid: string): Promise<Today> {
  const sb = createClient();
  const start = istDayStart();
  const [{ data: logs }, { count }] = await Promise.all([
    sb.from("call_logs").select("outcome, off_crm").eq("salesperson_id", uid).gte("started_at", start),
    sb.from("lead_activities").select("id", { count: "exact", head: true }).eq("actor_id", uid).eq("type", "site_visit").gte("created_at", start),
  ]);
  const rows = (logs ?? []).filter((r: any) => !r.off_crm);
  return { calls: rows.length, connected: rows.filter((r: any) => r.outcome === "connected").length, visits: count ?? 0 };
}

export async function updateNotes(id: string, notes: string) {
  must(await createClient().from("contacts").update({ notes }).eq("id", id));
}

async function scheduleFollowUp(p: Profile, lead: Lead, due: Date, note: string, mirrorStatus: boolean) {
  const sb = createClient();
  if (mirrorStatus) must(await sb.from("contacts").update({ status: "follow_up" }).eq("id", lead.id));
  const { data: ex } = must(await sb.from("follow_ups").select("id").eq("contact_id", lead.id).eq("status", "pending").limit(1));
  if (ex && ex.length) {
    must(await sb.from("follow_ups").update({ due_at: due.toISOString(), note }).eq("id", (ex[0] as any).id));
  } else {
    must(await sb.from("follow_ups").insert({ company_id: p.company_id, salesperson_id: p.id, contact_id: lead.id,
      phone: lead.phone, name: lead.name, due_at: due.toISOString(), note }));
  }
}

export type SaveInput = {
  lead: Lead; outcome: string; stageLabel: string; note?: string; visitAt?: Date | null;
  callbackAt?: Date | null; startedAt: number; followUpId?: string | null;
};

/** Mirrors Android postCallDispose + the call_logs row a dialled call leaves. */
export async function saveOutcome(p: Profile, i: SaveInput) {
  const sb = createClient();
  const conn = OUTCOMES.find((o) => o.code === i.outcome)?.connected ?? false;

  // The lead first: it is the write the database can refuse (closing a lead
  // that visited the site needs the visit outcome — trg_require_visit_outcome).
  // Refused here, nothing else is written and the sheet shows the reason.
  // Written last, the call and a "Stage → Not interested" line were saved for
  // a lead that never moved, and the rep had already gone to the next one.
  const upd: Record<string, unknown> = { status: i.outcome };
  if (i.note) upd.notes = i.note;
  if (i.outcome === "site_visit" && i.visitAt) upd.site_visit_at = i.visitAt.toISOString();
  must(await sb.from("contacts").update(upd).eq("id", i.lead.id));

  // A browser can't read the dialer, so the length of the call is unknown and
  // duration_seconds (NOT NULL) says 0. recording_source names the channel —
  // sim / sip / callerdesk / web — so a 0 from here is never mistaken for a
  // phone that rang out.
  must(await sb.from("call_logs").insert({ company_id: p.company_id, salesperson_id: p.id, contact_id: i.lead.id,
    phone: i.lead.phone, direction: "outgoing", outcome: conn ? "connected" : i.outcome === "no_answer" || i.outcome === "busy" ? "no_answer" : "failed",
    started_at: new Date(i.startedAt).toISOString(), ended_at: new Date().toISOString(), duration_seconds: 0,
    recording_status: "none", recording_source: "web" }));

  const acts: [string, string][] = [outcomeDetail(i.outcome, i.stageLabel)];
  if (i.outcome === "site_visit" && i.visitAt) acts.push(["site_visit", `Site visit booked for ${i.visitAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}`]);
  if (i.note) acts.push(["note", i.note]);
  must(await sb.from("lead_activities").insert(acts.map(([type, detail]) => ({ company_id: p.company_id, contact_id: i.lead.id,
    actor_id: p.id, actor_name: p.full_name, type, detail }))));

  // Answering a callback FINISHES that callback, so it closes before the next
  // one is booked. The other order found the same pending row, moved it to
  // tomorrow, then marked it done — a "No answer" from Follow Ups lost its retry
  // and the lead fell out of every list. Android closes first for this reason.
  if (i.followUpId) must(await sb.from("follow_ups").update({ status: "done", completed_at: new Date().toISOString() }).eq("id", i.followUpId));

  if (RETRY.has(i.outcome)) {
    const tries = (i.lead.attempts ?? 0) + 1;
    const bump: Record<string, unknown> = { attempts: tries };
    if (tries >= 3) bump.temperature = "cold";
    must(await sb.from("contacts").update(bump).eq("id", i.lead.id));
    if (tries < 3) await scheduleFollowUp(p, i.lead, nextAttempt(tries), `Attempt ${tries + 1} — no answer last time`, false);
  } else if (i.outcome === "follow_up" && i.callbackAt) {
    await scheduleFollowUp(p, i.lead, i.callbackAt, i.note || "Call back", true);
  } else if (i.outcome === "interested" && i.callbackAt) {
    // Android asks "When will you call again?" after Interested. Without a
    // time the lead lands in "No step" and goes cold.
    await scheduleFollowUp(p, i.lead, i.callbackAt, i.note || "Interested — call again", false);
  }
}

/** What happens to the lead after each answer, said before the rep saves. */
export function afterSave(code: string, lead: Lead, when: Date | null, now = new Date()): string {
  const t = (d: Date) => fmtWhen(d, now);
  switch (code) {
    case "no_answer": case "busy": case "wrong_person": {
      const tries = (lead.attempts ?? 0) + 1;
      return tries >= 3 ? "3rd try with no answer. Marked cold. It comes back to Call now tomorrow."
        : `Back in Call now ${t(nextAttempt(tries, now))}. We'll remind you.`;
    }
    case "follow_up": return when ? `We'll remind you ${t(when)}.` : "Pick a time to call back.";
    case "interested": return when ? `Next call ${t(when)}. We'll remind you.` : "Pick when you'll call again.";
    case "site_visit": return when ? `Visit booked for ${t(when)}.` : "Pick the visit day.";
    case "not_interested": return "The lead closes. No more reminders.";
    case "invalid": return "Number marked wrong. The lead closes.";
    default: return "";
  }
}

export function fmtWhen(d: Date, now = new Date()): string {
  const time = d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(d) - day(now)) / 86400000);
  if (diff === 0) return `today ${time}`;
  if (diff === 1) return `tomorrow ${time}`;
  return `${d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}, ${time}`;
}

/* ---------- Scan: who already has these numbers ---------- */

export type Known = "mine" | "team" | "dnc";

/** Company-wide, from scan_known_phones (migration 0229). null = the check
 *  could not run; the caller falls back to the rep's own leads. */
export async function knownPhones(phones: string[]): Promise<Map<string, Known> | null> {
  if (!phones.length) return new Map();
  const { data, error } = await createClient().rpc("scan_known_phones", { p_phones: phones });
  if (error) return null;
  return new Map((data as { phone: string; state: Known }[]).map((r) => [r.phone, r.state]));
}

/* ---------- Reminders (Web Push) ---------- */

export type PushState = "on" | "off" | "blocked" | "install-first" | "unsupported";

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const standalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true;

export async function pushState(): Promise<PushState> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return "unsupported";
  // iPhone only allows web push for an app added to the Home Screen.
  if (!("PushManager" in window)) return isIOS() && !standalone() ? "install-first" : "unsupported";
  if (Notification.permission === "denied") return "blocked";
  const reg = await navigator.serviceWorker.getRegistration("/app");
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "on" : "off";
}

function keyBytes(b64: string): ArrayBuffer {
  const s = atob(b64.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64.length + 3) % 4));
  const out = new Uint8Array(new ArrayBuffer(s.length));
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out.buffer;
}

/** Must run from a tap: browsers only show the permission prompt then. */
export async function enableReminders(): Promise<PushState> {
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return perm === "denied" ? "blocked" : "off";
  const reg = (await navigator.serviceWorker.getRegistration("/app"))
    ?? (await navigator.serviceWorker.register("/sw.js", { scope: "/app" }));
  await navigator.serviceWorker.ready;
  const sb = createClient();
  const { data, error } = await sb.functions.invoke("web-push", { body: { action: "key" } });
  if (error || !data?.publicKey) throw new Error("Reminders aren't ready yet. Try again later.");
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(data.publicKey) });
  const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  const { error: e2 } = await sb.rpc("web_push_subscribe", {
    p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_user_agent: navigator.userAgent });
  if (e2) throw new Error("Reminders aren't ready yet. Try again later.");
  return "on";
}

/** On sign-out: this phone must stop ringing for this rep. */
export async function disableReminders(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.getRegistration("/app");
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    await createClient().rpc("web_push_unsubscribe", { p_endpoint: sub.endpoint });
    await sub.unsubscribe();
  } catch { /* signing out must never fail because of this */ }
}

/** Mirrors Android addLead for Scan list rows. Returns how many were really
 *  added: trg_dedup_contact_by_phone silently drops a number that is already
 *  anywhere in the company (another rep's lead included), and the rep should
 *  hear "8 added", not "10 added" for a list where two were already taken. */
export async function addScanned(p: Profile, rows: ScanRow[], tag: string): Promise<number> {
  if (!rows.length) return 0;
  const { data } = must(await createClient().from("contacts").insert(rows.map((r) => ({ company_id: p.company_id,
    salesperson_id: p.id, name: r.name || null, phone: r.phone, status: "new", lead_source: tag }))).select("id"));
  return data?.length ?? 0;
}
