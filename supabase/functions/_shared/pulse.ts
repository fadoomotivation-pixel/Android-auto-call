// One telecaller day, built once and written once.
//
// The Pulse page and the 7pm WhatsApp automation are the same report reaching
// the founder two different ways — on screen when they go looking, and pushed
// when they don't. That has to stay ONE piece of code. The moment the page
// formats a rep's day in the browser and the cron formats it again in Deno, the
// founder starts getting a WhatsApp that disagrees with the dashboard they
// opened ten seconds earlier, and neither number gets trusted again.
//
// So: buildCompany() gathers the day and pulseText() writes it. team-pulse
// returns BOTH the data and the text; the page renders the data and shares the
// text it was given, and pulse-broadcast sends that same text.

import { type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { chatJson } from "./chat.ts";

const IST_MS = 5.5 * 3600 * 1000;

export function istDate(offset = 0): string {
  return new Date(Date.now() + IST_MS + offset * 86400_000).toISOString().slice(0, 10);
}

/** The hour it is right now in IST, 0-23 — what a "send at 7pm" schedule means. */
export function istHour(): number {
  return new Date(Date.now() + IST_MS).getUTCHours();
}

export function dayBounds(dateIst: string): { start: string; end: string } {
  return { start: `${dateIst}T00:00:00+05:30`, end: `${dateIst}T23:59:59+05:30` };
}

export function fmtDur(sec: number): string {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${sec}s`;
}

/** Always IST. A founder in Noida reading a UTC callback time will miss it. */
function istTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true,
  });
}
function istDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });
}
function prettyDate(dateIst: string): string {
  return new Date(`${dateIst}T12:00:00+05:30`).toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short",
  });
}

export type NextStep = { lead: string; when: string; note: string | null };

export type RepPulse = {
  id: string;
  name: string;
  calls: number;
  connected: number;
  talkSeconds: number;
  voiceNotes: { summary: string | null; lead: string; disposition: string | null; audioPath: string | null }[];
  moves: { detail: string; lead: string; byAi: boolean }[];
  siteVisits: string[];
  followUps: number;
  hotLeads: number;
  /** Leads they got real talk time with today, longest first. */
  topLeads: string[];
  /** Dialled today, never connected — the ones still owed a call. */
  noConnect: string[];
  /** What is actually booked next, with the time. */
  nextSteps: NextStep[];
  narrative?: string;
};

export type CompanyPulse = {
  date: string;
  totals: { calls: number; connected: number; notes: number; visits: number; talkSeconds: number };
  reps: RepPulse[];
};

/**
 * A voice note only belongs in a founder's update if it SAYS something. An
 * unprocessed or empty one is filler the owner has to delete before forwarding.
 * Shared with the page so both drop exactly the same lines.
 */
export function realNotes(r: RepPulse) {
  return r.voiceNotes.filter((v) => {
    const t = (v.summary ?? "").trim();
    return t.length > 3 && !/^empty note$/i.test(t) && !/^\(processing\)$/i.test(t);
  });
}

/**
 * Pipeline moves the AI made FROM a voice note are already described by that
 * note's own line, so printing them again just makes the report longer to read.
 */
export function newsworthyMoves(r: RepPulse) {
  return r.moves.filter((m) => !/\(from voice note\)/i.test(m.detail));
}

export async function buildCompany(
  admin: SupabaseClient,
  companyId: string,
  date: string,
): Promise<CompanyPulse> {
  const { start, end } = dayBounds(date);

  const { data: reps } = await admin.from("profiles")
    .select("id, full_name").eq("company_id", companyId).eq("role", "salesperson");
  const repList = reps ?? [];
  const nameById = new Map(repList.map((r) => [r.id, r.full_name || "Telecaller"]));

  // Contact names for pretty labels.
  const { data: contacts } = await admin.from("contacts")
    .select("id, name, phone").eq("company_id", companyId);
  const leadName = new Map((contacts ?? []).map((c) => [c.id, c.name || c.phone || "lead"]));

  const [calls, notes, acts, visits, fups, hot, steps] = await Promise.all([
    // started_at, not created_at: the phone's call-log sync backfills a week of
    // history the first time it runs, and every one of those rows is created
    // TODAY — which reported a whole week as one day's work. off_crm calls are
    // the rep's own and never counted as work.
    admin.from("call_logs").select("salesperson_id, contact_id, phone, outcome, duration_seconds")
      .eq("company_id", companyId).gte("started_at", start).lte("started_at", end)
      .or("off_crm.is.null,off_crm.eq.false"),
    admin.from("lead_voice_notes").select("actor_id, contact_id, summary, suggested_disposition, audio_path")
      .eq("company_id", companyId).gte("created_at", start).lte("created_at", end),
    admin.from("lead_activities").select("actor_id, actor_name, contact_id, detail, type")
      .eq("company_id", companyId).gte("created_at", start).lte("created_at", end)
      .in("type", ["status", "site_visit", "follow_up", "budget", "temperature"]),
    admin.from("contacts").select("salesperson_id, name, phone, site_visit_at")
      .eq("company_id", companyId).gte("site_visit_at", start).lte("site_visit_at", end),
    admin.from("follow_ups").select("salesperson_id").eq("company_id", companyId)
      .gte("created_at", start).lte("created_at", end),
    admin.from("contacts").select("salesperson_id").eq("company_id", companyId)
      .eq("temperature", "hot").not("status", "in", "(booked,lost,not_interested,dnc)"),
    // What happens NEXT. A founder reading at 7pm can still act on tonight's
    // callbacks, which is exactly the half of the report they were missing —
    // the day's numbers are history by the time they read them.
    admin.from("follow_ups").select("salesperson_id, name, phone, due_at, note")
      .eq("company_id", companyId).eq("status", "pending")
      .gte("due_at", start).lte("due_at", `${istDate(2)}T23:59:59+05:30`)
      .order("due_at", { ascending: true }),
  ]);

  const map = new Map<string, RepPulse>();
  const rep = (id: string | null): RepPulse | null => {
    if (!id || !nameById.has(id)) return null;
    if (!map.has(id)) {
      map.set(id, {
        id, name: nameById.get(id)!, calls: 0, connected: 0, talkSeconds: 0,
        voiceNotes: [], moves: [], siteVisits: [], followUps: 0, hotLeads: 0,
        topLeads: [], noConnect: [], nextSteps: [],
      });
    }
    return map.get(id)!;
  };

  // Per rep, per lead: how long they actually talked, and whether they ever
  // got through. One lead dialled six times is ONE name on the list, not six.
  const perLead = new Map<string, Map<string, { talk: number; connected: boolean }>>();
  for (const c of calls.data ?? []) {
    const r = rep(c.salesperson_id); if (!r) continue;
    r.calls++;
    const dur = c.duration_seconds ?? 0;
    if (c.outcome === "connected") r.connected++;
    r.talkSeconds += dur;

    const label = (c.contact_id ? leadName.get(c.contact_id) : null) ?? c.phone ?? null;
    if (!label) continue;
    if (!perLead.has(r.id)) perLead.set(r.id, new Map());
    const m = perLead.get(r.id)!;
    const cur = m.get(label) ?? { talk: 0, connected: false };
    cur.talk += dur;
    if (c.outcome === "connected") cur.connected = true;
    m.set(label, cur);
  }
  for (const [repId, leads] of perLead) {
    const r = map.get(repId); if (!r) continue;
    const entries = [...leads.entries()];
    r.topLeads = entries.filter(([, v]) => v.connected && v.talk >= 30)
      .sort((a, b) => b[1].talk - a[1].talk).slice(0, 4).map(([k]) => k);
    r.noConnect = entries.filter(([, v]) => !v.connected).map(([k]) => k).slice(0, 6);
  }

  for (const n of notes.data ?? []) {
    const r = rep(n.actor_id); if (!r) continue;
    r.voiceNotes.push({
      summary: n.summary, lead: leadName.get(n.contact_id) ?? "lead",
      disposition: n.suggested_disposition, audioPath: n.audio_path ?? null,
    });
  }
  for (const a of acts.data ?? []) {
    const r = rep(a.actor_id); if (!r) continue;
    r.moves.push({ detail: a.detail, lead: leadName.get(a.contact_id) ?? "lead", byAi: (a.actor_name ?? "").includes("AI") });
  }
  for (const v of visits.data ?? []) {
    const r = rep(v.salesperson_id); if (!r) continue;
    r.siteVisits.push(v.name || v.phone || "lead");
  }
  for (const f of fups.data ?? []) { const r = rep(f.salesperson_id); if (r) r.followUps++; }
  for (const h of hot.data ?? []) { const r = rep(h.salesperson_id); if (r) r.hotLeads++; }
  for (const s of steps.data ?? []) {
    const r = rep(s.salesperson_id); if (!r || r.nextSteps.length >= 5 || !s.due_at) continue;
    const today = String(s.due_at).slice(0, 10) === date;
    r.nextSteps.push({
      lead: s.name || s.phone || "lead",
      when: today ? istTime(s.due_at) : `${istDay(s.due_at)} ${istTime(s.due_at)}`,
      note: (s.note ?? "").trim() || null,
    });
  }

  // Include reps with zero activity too (owner wants to see who was idle).
  for (const rp of repList) rep(rp.id);

  const pulses = [...map.values()].sort((a, b) => (b.calls + b.voiceNotes.length) - (a.calls + a.voiceNotes.length));

  // One narrative per rep. This goes through the shared provider chain rather
  // than straight to Groq: this report now runs unattended every evening for
  // every company, and Groq's free daily token budget is shared with sixteen
  // other functions. A digest that silently stops arriving in week three is
  // worse than one that was never promised.
  await Promise.all(pulses.map(async (p) => {
    const active = p.calls || p.voiceNotes.length || p.moves.length || p.siteVisits.length;
    if (!active) { p.narrative = "No activity today — check in with them."; return; }
    const facts = {
      rep: p.name, calls: p.calls, connected: p.connected, talk: fmtDur(p.talkSeconds),
      site_visits: p.siteVisits, follow_ups: p.followUps, hot_leads: p.hotLeads,
      next_steps: p.nextSteps.map((s) => `${s.lead} at ${s.when}${s.note ? ` — ${s.note}` : ""}`),
      pipeline_moves: p.moves.slice(0, 12).map((m) => `${m.lead}: ${m.detail}${m.byAi ? " [AI]" : ""}`),
      // Only notes that actually say something. Feeding "(processing)" or an
      // empty note in is how filler lines ended up in a founder's WhatsApp.
      voice_note_summaries: realNotes(p).slice(0, 8).map((v) => `${v.lead}: ${v.summary}`),
    };
    try {
      const { text } = await chatJson(
        "You brief a real-estate company FOUNDER on ONE telecaller's day. " +
          "This is forwarded as-is on WhatsApp, so every line has to earn its place.\n" +
          "Reply as JSON: {\"narrative\": \"...\"} — 2-3 short sentences, nothing else.\n" +
          "Simple English with the odd everyday Hindi word is fine; no formal Hindi, " +
          "no markdown, no preamble, no sign-off.\n" +
          "NEVER repeat the call/connected/talk-time numbers, and never re-list the " +
          "next steps or lead names — all of that is already printed directly around " +
          "your text, and repeating it is the first thing the owner deletes. Skip " +
          "anything with no real content. Do not describe the same lead move twice.\n" +
          "Spend the words on what a founder cannot see from the numbers: which deals " +
          "actually moved and why, what is at risk, and the one thing that needs the " +
          "founder's attention.",
        JSON.stringify(facts),
        { temperature: 0.4 },
      );
      const n = String(JSON.parse(text)?.narrative ?? "").trim();
      if (n) p.narrative = n;
    } catch (_) {
      // A missing narrative costs a nice-to-have line. Losing the whole report
      // because one model was rate-limited costs the founder their evening
      // update, so the numbers go out either way.
    }
  }));

  const totals = pulses.reduce((t, p) => ({
    calls: t.calls + p.calls, connected: t.connected + p.connected,
    notes: t.notes + realNotes(p).length, visits: t.visits + p.siteVisits.length,
    talkSeconds: t.talkSeconds + p.talkSeconds,
  }), { calls: 0, connected: 0, notes: 0, visits: 0, talkSeconds: 0 });

  return { date, totals, reps: pulses };
}

/** ONE rep's day, as sent. */
export function repText(r: RepPulse, date: string, companyName?: string | null): string {
  const L: string[] = [`📊 ${r.name} | Daily Pulse | ${prettyDate(date)}`];
  if (companyName) L.push(companyName);

  const idle = !r.calls && !r.voiceNotes.length && !r.moves.length && !r.siteVisits.length;
  if (idle) {
    L.push("", "No calls, no notes, no lead moves today.");
    L.push("", "— via Call Pro AI");
    return L.join("\n");
  }

  L.push("", `Today: ${r.calls} calls | ${r.connected} connected | ${fmtDur(r.talkSeconds)} talk` +
    (r.hotLeads ? ` | 🔥 ${r.hotLeads} hot` : ""));

  if (r.narrative) L.push("", r.narrative);

  const bits: string[] = [];
  if (r.topLeads.length) bits.push(`Top calls: ${r.topLeads.join(", ")}`);
  if (r.siteVisits.length) bits.push(`📍 Site visit: ${r.siteVisits.join(", ")}`);
  if (r.noConnect.length) bits.push(`No connect: ${r.noConnect.join(", ")}`);
  if (bits.length) L.push("", ...bits);

  const notes = realNotes(r);
  if (notes.length) {
    L.push("", "🎤 What they heard:");
    notes.slice(0, 4).forEach((v) => L.push(`• ${v.lead}: ${v.summary}`));
  }

  const moves = newsworthyMoves(r);
  if (moves.length) {
    L.push("", "🔄 Lead moves:");
    moves.slice(0, 5).forEach((m) => L.push(`• ${m.lead}: ${m.detail}${m.byAi ? " (AI)" : ""}`));
  }

  if (r.nextSteps.length) {
    L.push("", "⏰ Next steps:");
    r.nextSteps.forEach((s) => L.push(`• ${s.lead} — ${s.when}${s.note ? ` · ${s.note}` : ""}`));
  }

  L.push("", "— via Call Pro AI");
  return L.join("\n");
}

/**
 * The whole team in one message.
 *
 * A founder with five reps does not want five WhatsApps at 7pm, so this is one
 * message: the team line first (read it and you know if the day was good), then
 * each rep, then — deliberately last and never omitted — who did nothing. A
 * report that only lists activity lets a silent rep disappear, and a silent rep
 * is the thing the founder most needs to see.
 */
export function pulseText(p: CompanyPulse, companyName?: string | null): string {
  const L: string[] = [`📊 ${companyName ? `${companyName} · ` : ""}Daily Pulse`, prettyDate(p.date)];
  L.push("", `Team: ${p.totals.calls} calls | ${p.totals.connected} connected | ` +
    `${fmtDur(p.totals.talkSeconds)} talk | ${p.totals.visits} site visits`);

  const worked = p.reps.filter((r) => r.calls || r.voiceNotes.length || r.moves.length || r.siteVisits.length);
  const idle = p.reps.filter((r) => !worked.includes(r));

  for (const r of worked) {
    L.push("", "━━━━━━━━━━━━━━━", `👤 ${r.name}`);
    L.push(`${r.calls} calls | ${r.connected} connected | ${fmtDur(r.talkSeconds)} talk` +
      (r.hotLeads ? ` | 🔥 ${r.hotLeads} hot` : ""));
    if (r.narrative) L.push(r.narrative);
    if (r.topLeads.length) L.push(`Top calls: ${r.topLeads.join(", ")}`);
    realNotes(r).slice(0, 3).forEach((v) => L.push(`🎤 ${v.lead}: ${v.summary}`));
    newsworthyMoves(r).slice(0, 4).forEach((m) => L.push(`🔄 ${m.lead}: ${m.detail}${m.byAi ? " (AI)" : ""}`));
    if (r.siteVisits.length) L.push(`📍 Site visit: ${r.siteVisits.join(", ")}`);
    if (r.noConnect.length) L.push(`No connect: ${r.noConnect.slice(0, 5).join(", ")}`);
    r.nextSteps.slice(0, 3).forEach((s) => L.push(`⏰ ${s.lead} — ${s.when}${s.note ? ` · ${s.note}` : ""}`));
  }

  if (idle.length) {
    L.push("", "━━━━━━━━━━━━━━━", `⚠️ No activity today: ${idle.map((r) => r.name).join(", ")}`);
  }

  L.push("", "— via Call Pro AI");
  return L.join("\n");
}

/**
 * WhatsApp rejects anything over 4096 characters, and a big team's report goes
 * past it. Split on rep boundaries so a telecaller's day is never cut in half
 * across two messages.
 */
export function splitForWhatsApp(text: string, limit = 3500): string[] {
  if (text.length <= limit) return [text];
  const blocks = text.split("\n━━━━━━━━━━━━━━━\n");
  const out: string[] = [];
  let cur = "";
  for (const b of blocks) {
    const piece = cur ? `${cur}\n━━━━━━━━━━━━━━━\n${b}` : b;
    if (piece.length > limit && cur) { out.push(cur); cur = b; } else { cur = piece; }
  }
  if (cur) out.push(cur);
  // A single rep whose own block busts the limit still has to go somewhere.
  return out.flatMap((s) => s.length <= limit ? [s] : (s.match(new RegExp(`[\\s\\S]{1,${limit}}`, "g")) ?? [s]));
}
