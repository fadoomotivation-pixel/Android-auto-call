"use client";
// Telecaller PWA data layer. Every read and write here mirrors the Android
// Repository.kt (same tables, same columns, same retry ladder) so a lead touched
// in the browser looks exactly like one touched in the app. No new business logic.
import { createClient } from "@/lib/supabase/client";
import type { ScanRow } from "./scanParser";

export type Lead = {
  id: string;
  name: string | null;
  phone: string;
  status: string;
  temperature: string | null;
  attempts: number;
  notes: string | null;
  company_name: string | null;
  updated_at: string | null;
  action_state?: string | null;
  due_at?: string | null;
  last_call_at?: string | null;
};
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
    sb.from("v_lead_workstate").select("contact_id, action_state, due_at, last_call_at").limit(2000),
  ]);
  const ws = new Map<string, any>((w ?? []).map((r: any) => [r.contact_id, r]));
  return (c ?? []).map((r: any) => ({ ...r, attempts: r.attempts ?? 0, ...(ws.get(r.id) ? {
    action_state: ws.get(r.id).action_state, due_at: ws.get(r.id).due_at, last_call_at: ws.get(r.id).last_call_at } : {}) }));
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
  await createClient().from("contacts").update({ notes }).eq("id", id);
}

async function scheduleFollowUp(p: Profile, lead: Lead, due: Date, note: string, mirrorStatus: boolean) {
  const sb = createClient();
  if (mirrorStatus) await sb.from("contacts").update({ status: "follow_up" }).eq("id", lead.id);
  const { data: ex } = await sb.from("follow_ups").select("id").eq("contact_id", lead.id).eq("status", "pending").limit(1);
  if (ex && ex.length) {
    await sb.from("follow_ups").update({ due_at: due.toISOString(), note }).eq("id", (ex[0] as any).id);
  } else {
    await sb.from("follow_ups").insert({ company_id: p.company_id, salesperson_id: p.id, contact_id: lead.id,
      phone: lead.phone, name: lead.name, due_at: due.toISOString(), note });
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
  // Browser can't read the dialer, so duration is unknown (0) and there is no recording.
  await sb.from("call_logs").insert({ company_id: p.company_id, salesperson_id: p.id, contact_id: i.lead.id,
    phone: i.lead.phone, direction: "outgoing", outcome: conn ? "connected" : i.outcome === "no_answer" || i.outcome === "busy" ? "no_answer" : "failed",
    started_at: new Date(i.startedAt).toISOString(), ended_at: new Date().toISOString(), duration_seconds: 0, recording_status: "none" });

  const upd: Record<string, unknown> = { status: i.outcome };
  if (i.note) upd.notes = i.note;
  if (i.outcome === "site_visit" && i.visitAt) upd.site_visit_at = i.visitAt.toISOString();
  await sb.from("contacts").update(upd).eq("id", i.lead.id);

  const acts: [string, string][] = [outcomeDetail(i.outcome, i.stageLabel)];
  if (i.outcome === "site_visit" && i.visitAt) acts.push(["site_visit", `Site visit booked for ${i.visitAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}`]);
  if (i.note) acts.push(["note", i.note]);
  await sb.from("lead_activities").insert(acts.map(([type, detail]) => ({ company_id: p.company_id, contact_id: i.lead.id,
    actor_id: p.id, actor_name: p.full_name, type, detail })));

  if (RETRY.has(i.outcome)) {
    const tries = (i.lead.attempts ?? 0) + 1;
    const bump: Record<string, unknown> = { attempts: tries };
    if (tries >= 3) bump.temperature = "cold";
    await sb.from("contacts").update(bump).eq("id", i.lead.id);
    if (tries < 3) await scheduleFollowUp(p, i.lead, nextAttempt(tries), `Attempt ${tries + 1} — no answer last time`, false);
  } else if (i.outcome === "follow_up" && i.callbackAt) {
    await scheduleFollowUp(p, i.lead, i.callbackAt, i.note || "Call back", true);
  }
  if (i.followUpId) await sb.from("follow_ups").update({ status: "done", completed_at: new Date().toISOString() }).eq("id", i.followUpId);
}

/** Mirrors Android addLead for Scan list rows. */
export async function addScanned(p: Profile, rows: ScanRow[], tag: string): Promise<number> {
  if (!rows.length) return 0;
  const { error } = await createClient().from("contacts").insert(rows.map((r) => ({ company_id: p.company_id,
    salesperson_id: p.id, name: r.name || null, phone: r.phone, status: "new", lead_source: tag })));
  if (error) throw error;
  return rows.length;
}
