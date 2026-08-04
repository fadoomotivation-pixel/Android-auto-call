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
  /** Leads whose site visit was BOOKED or moved today — the day's real wins. */
  visitsFixed: number;
  /** Deals closed today. The number a founder scrolls for. */
  bookings: number;
  /** Token money against today's bookings, in rupees. 0 when none was recorded
   *  — never estimated from a lead's budget, which is what the customer said
   *  they could spend, not what they paid. */
  revenue: number;
  /** What the AI did on its own, aggregated. Never one line per lead. */
  aiUpdates: string[];
  /** The single best thing that happened today, in one sentence. */
  win?: string;
  /** The one thing that could go wrong if nobody acts. */
  risk?: string;
  narrative?: string;
};

export type CompanyPulse = {
  date: string;
  totals: {
    calls: number; connected: number; notes: number; visits: number; talkSeconds: number;
    visitsFixed: number; bookings: number; revenue: number; hotLeads: number;
  };
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

/**
 * What the AI did today, counted — never listed.
 *
 * The founder's report used to print one line per automatic action, so a rep
 * with four unanswered calls produced four identical "Marked cold" lines and
 * one lead that got two callbacks a minute apart produced two. That is a log,
 * and a founder does not read logs. Counting DISTINCT LEADS turns the whole
 * pile into the one sentence they actually wanted: "4 leads with no answer
 * moved to Cold."
 */
export function aiUpdateLines(r: RepPulse): string[] {
  const ai = r.moves.filter((m) => m.byAi);
  const leadsWhere = (re: RegExp) => new Set(ai.filter((m) => re.test(m.detail)).map((m) => m.lead)).size;
  const cold = leadsWhere(/\bcold\b/i);
  const booked = leadsWhere(/(callback|follow[\s-]?up)/i);
  const out: string[] = [];
  if (cold) out.push(`${cold} lead${cold > 1 ? "s" : ""} with no answer moved to Cold.`);
  if (booked) out.push(`${booked} callback${booked > 1 ? "s" : ""} booked automatically.`);
  return out;
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
        topLeads: [], noConnect: [], nextSteps: [], visitsFixed: 0, bookings: 0,
        revenue: 0, aiUpdates: [],
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
  // Site visits BOOKED today, counted once per lead. `siteVisits` below is a
  // different question — whose visit is happening today — and a founder asking
  // "did we fix any visits?" is not asking that one. A lead whose visit gets
  // moved twice in an afternoon is still one visit fixed.
  const visitLeads = new Map<string, Set<string>>();
  for (const a of acts.data ?? []) {
    const r = rep(a.actor_id); if (!r) continue;
    r.moves.push({ detail: a.detail, lead: leadName.get(a.contact_id) ?? "lead", byAi: (a.actor_name ?? "").includes("AI") });
    if (a.type === "site_visit" && a.contact_id) {
      if (!visitLeads.has(r.id)) visitLeads.set(r.id, new Set());
      visitLeads.get(r.id)!.add(a.contact_id);
    }
  }
  for (const [repId, leads] of visitLeads) {
    const r = map.get(repId); if (r) r.visitsFixed = leads.size;
  }

  // Bookings, and the money actually recorded against them.
  //
  // Read from today's status activities rather than "contacts where status =
  // booked", because that column answers "is this lead booked" and not "did it
  // book TODAY" — a founder's evening report that counts every booking the
  // company has ever made is a number that only goes up and means nothing.
  //
  // Revenue is the token PAID (contacts.token_amount), never the lead's budget.
  // Budget is what a customer said they could spend; reporting it as revenue
  // would be inventing money, and a founder who catches that once stops
  // believing the whole report.
  const bookedByRep = new Map<string, Set<string>>();
  for (const a of acts.data ?? []) {
    const r = rep(a.actor_id); if (!r || !a.contact_id) continue;
    if (a.type === "status" && /\bbook(ed|ing)\b/i.test(String(a.detail ?? ""))) {
      if (!bookedByRep.has(r.id)) bookedByRep.set(r.id, new Set());
      bookedByRep.get(r.id)!.add(String(a.contact_id));
    }
  }
  const bookedIds = [...bookedByRep.values()].flatMap((s) => [...s]);
  const tokenById = new Map<string, number>();
  if (bookedIds.length) {
    const { data: tokens } = await admin.from("contacts")
      .select("id, token_amount").in("id", bookedIds);
    for (const t of tokens ?? []) tokenById.set(String(t.id), Number(t.token_amount ?? 0) || 0);
  }
  for (const [repId, leads] of bookedByRep) {
    const r = map.get(repId); if (!r) continue;
    r.bookings = leads.size;
    r.revenue = [...leads].reduce((s, id) => s + (tokenById.get(id) ?? 0), 0);
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

  // What the AI did runs on arithmetic, not on the model: a count of leads is
  // something we KNOW, and a founder should never be told a number a language
  // model estimated for them.
  for (const p of pulses) p.aiUpdates = aiUpdateLines(p);

  // The win and the risk, one sentence each. This goes through the shared
  // provider chain rather than straight to Groq: this report now runs
  // unattended every evening for every company, and Groq's free daily token
  // budget is shared with sixteen other functions. A digest that silently
  // stops arriving in week three is worse than one that was never promised.
  //
  // Two named fields, not a free paragraph. Asked for a "narrative" the model
  // wrote a tidy essay that re-listed the leads and the numbers printed right
  // above it — and a founder reading the same four names three times stops
  // reading. A win and a risk are the two things they cannot get from the
  // figures, and naming them is what stops the model padding.
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
          "Reply as JSON: {\"win\": \"...\", \"risk\": \"...\"} and nothing else.\n" +
          "win  = the single best thing that happened today, ONE sentence, naming the " +
          "customer and what they committed to.\n" +
          "risk = the one thing that goes wrong if nobody acts, ONE sentence. Use \"\" " +
          "when there is genuinely nothing at risk — an invented risk gets the real " +
          "ones ignored.\n" +
          "Simple English. No markdown, no preamble, no sign-off, no formal Hindi.\n" +
          "NEVER repeat the call/connected/talk-time numbers and never list the next " +
          "steps — they are printed directly around your text and a founder reading " +
          "the same thing twice stops reading.\n" +
          "This is a founder, not a supervisor: no call logs. Never write \"call did " +
          "not connect\", \"attempt 1\", \"marked cold\", \"stage changed\" or how many " +
          "seconds a call lasted. Say what it MEANS for the deal.\n" +
          "MONEY IS NOT YOURS TO CLAIM. Never say a customer paid, booked, gave a " +
          "token, blocked or held a unit, or signed anything, unless the facts you " +
          "were given say so in as many words. A site visit is a site visit. " +
          "Inventing a payment is the single worst thing you can do here — the " +
          "founder acts on it.",
        JSON.stringify(facts),
        { temperature: 0.4 },
      );
      const j = JSON.parse(text) ?? {};
      // The prompt asks the model not to invent money. This CHECKS.
      //
      // It went wrong exactly once and that was enough: a lead whose real state
      // was site_visit, with token_amount null, was reported to the founder as
      // "Yogesh Rajput booked a site visit for UP-16 and paid the token amount
      // to hold the unit" — in a message whose own KPI block, three lines
      // above, said "Bookings: 0". The founder went looking for money that did
      // not exist.
      //
      // A prompt is a request. Where the database already knows the answer, the
      // model does not get a vote.
      const win = moneySafe(String(j.win ?? "").trim(), p);
      const risk = moneySafe(String(j.risk ?? "").trim(), p);
      if (win) p.win = win;
      if (risk) p.risk = risk;
      // The Pulse page has shown `narrative` since day one and is not part of
      // this change, so it keeps getting one — built from the same two lines.
      const n = [win, risk].filter(Boolean).join(" ");
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
    visitsFixed: t.visitsFixed + p.visitsFixed, bookings: t.bookings + p.bookings,
    revenue: t.revenue + p.revenue, hotLeads: t.hotLeads + p.hotLeads,
  }), {
    calls: 0, connected: 0, notes: 0, visits: 0, talkSeconds: 0,
    visitsFixed: 0, bookings: 0, revenue: 0, hotLeads: 0,
  });

  return { date, totals, reps: pulses };
}

/** Connected out of dialled, as a founder would say it: "7 (88%)". */
function connectedLine(calls: number, connected: number): string {
  const pct = calls > 0 ? Math.round((connected / calls) * 100) : 0;
  return `${connected}${calls > 0 ? ` (${pct}%)` : ""}`;
}

/** Indian money, the way it is read out loud: ₹50,000 · ₹4.5L · ₹1.2Cr. */
function rupees(n: number): string {
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(n % 10_000_000 === 0 ? 0 : 2)}Cr`;
  if (n >= 100_000) return `₹${(n / 100_000).toFixed(n % 100_000 === 0 ? 0 : 2)}L`;
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

/**
 * What a founder looks for first, in the order they look for it.
 *
 * Bookings and site visits come before calls because the business is bookings
 * and site visits — a report that opens with dial counts is a call-centre
 * report, and the owner has to read to the bottom to find out whether anything
 * was actually sold. Zero bookings still prints: a zero the founder can see is
 * the point of the line.
 *
 * "Visit rate" names its own denominator. An unlabelled conversion % is a
 * number two people read as two different things in the same meeting.
 */
function kpiBlock(k: {
  bookings: number; revenue: number; visitsFixed: number; hotLeads: number;
  calls: number; connected: number; talkSeconds: number;
}): string[] {
  const L = [`• Bookings: ${k.bookings}`];
  if (k.revenue > 0) L.push(`• Token collected: ${rupees(k.revenue)}`);
  L.push(`• Site visits fixed: ${k.visitsFixed}`);
  if (k.hotLeads) L.push(`• Hot leads: ${k.hotLeads}`);
  // Talk time back on the line, at the founder's request. It reads as one
  // sentence — "22 calls, 15 connected, 18m talk" — and it is the one thing
  // here that separates a rep who dialled all day from a rep who had
  // conversations. Dropping it when this block was rewritten lost the only
  // measure of whether the connects were worth anything.
  L.push(
    `• Calls: ${k.calls} · connected ${connectedLine(k.calls, k.connected)}` +
      (k.talkSeconds > 0 ? ` · ${fmtDur(k.talkSeconds)} talk` : ""),
  );
  if (k.connected > 0) {
    L.push(`• Visit rate: ${Math.round((k.visitsFixed / k.connected) * 100)}% of everyone talked to`);
  }
  return L;
}

/**
 * Drop any AI line that claims money the CRM has no record of.
 *
 * Deliberately blunt: the line is dropped whole rather than edited down. A
 * half-corrected sentence still reads as a claim, and there is no safe way to
 * rewrite "paid the token amount to hold the unit" into something true without
 * knowing what actually happened. Losing one narrative line costs a nice
 * sentence; leaving it in costs the founder's trust in every number above it.
 *
 * Only fires when the structured facts DISAGREE. A rep who really did book a
 * deal today keeps their sentence, money and all.
 */
const MONEY_CLAIM =
  /\b(paid|payment|token|booked the|booking amount|advance|cheque|deposit|blocked the unit|held the unit|hold the unit|signed|registration|down ?payment)\b/i;

function moneySafe(line: string, r: { bookings: number; revenue: number }): string {
  if (!line) return line;
  if (r.bookings > 0 || r.revenue > 0) return line;
  return MONEY_CLAIM.test(line) ? "" : line;
}

/**
 * The sign-off, on every message this file writes.
 *
 * One constant, because a footer that drifts between the single-rep report and
 * the team roll-up is the sort of thing nobody notices until a founder forwards
 * two of them into the same WhatsApp group.
 */
export const PULSE_FOOTER = "Auto Generated by Call Pro AI • Executive Intelligence";

/**
 * ONE rep's day, as the founder reads it.
 *
 * Wins → risks → priorities → metrics, and nothing else. What used to be here
 * was the CRM's own diary written out longhand: every voice-note summary, every
 * "Attempt 1 — didn't connect", every "Marked cold", the same lead's callback
 * printed twice a minute apart, "a 42 second call is on the log". All of it
 * true, none of it a decision — and the owner has to scroll past forty lines of
 * it to find the one customer who agreed to visit the site.
 *
 * That detail is not deleted, it is just not HERE. It belongs on the Pulse page
 * and in the rep's own screens, where someone is working the leads. A founder
 * reads this on a phone between two other things.
 */
export function repText(r: RepPulse, date: string, companyName?: string | null): string {
  const L: string[] = [`📊 ${r.name} | Daily Pulse | ${prettyDate(date)}`];
  if (companyName) L.push(companyName);

  const idle = !r.calls && !r.voiceNotes.length && !r.moves.length && !r.siteVisits.length;
  if (idle) {
    L.push("", "No calls, no notes, no lead moves today.");
    L.push("", PULSE_FOOTER);
    return L.join("\n");
  }

  L.push("", "🟢 Today", ...kpiBlock(r));

  if (r.win) L.push("", "🎯 Biggest win", `✅ ${r.win}`);
  if (r.risk) L.push("", "⚠️ Risk", `🔸 ${r.risk}`);

  // Tomorrow morning's first calls, with the time — the half of the report a
  // founder can still act on. The day's numbers are already history by 7pm.
  if (r.nextSteps.length) {
    L.push("", "🎯 Priority next");
    r.nextSteps.slice(0, 4).forEach((s) => L.push(`• ${s.lead} — ${s.when}`));
  }

  if (r.aiUpdates.length) {
    L.push("", "🤖 AI update");
    r.aiUpdates.forEach((u) => L.push(`• ${u}`));
  }

  L.push("", PULSE_FOOTER);
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
  L.push("", "🟢 Today", ...kpiBlock(p.totals));

  const worked = p.reps.filter((r) => r.calls || r.voiceNotes.length || r.moves.length || r.siteVisits.length);
  const idle = p.reps.filter((r) => !worked.includes(r));

  // The same shape as the single-rep message, tightened to four lines a rep.
  // Five reps' worth of voice-note summaries, lead-move logs and no-connect
  // lists was a message that had to be split across three WhatsApps before the
  // founder had read a single decision.
  for (const r of worked) {
    L.push("", "━━━━━━━━━━━━━━━", `👤 ${r.name}`);
    L.push(`${r.calls} calls | ${connectedLine(r.calls, r.connected)} connected` +
      (r.hotLeads ? ` | 🔥 ${r.hotLeads} hot` : "") +
      (r.visitsFixed ? ` | 📍 ${r.visitsFixed} visit${r.visitsFixed > 1 ? "s" : ""} fixed` : "") +
      (r.bookings ? ` | 🎉 ${r.bookings} booked${r.revenue ? ` ${rupees(r.revenue)}` : ""}` : ""));
    if (r.win) L.push(`✅ ${r.win}`);
    if (r.risk) L.push(`🔸 ${r.risk}`);
    r.nextSteps.slice(0, 2).forEach((s) => L.push(`🎯 Next: ${s.lead} — ${s.when}`));
    r.aiUpdates.forEach((u) => L.push(`🤖 ${u}`));
  }

  if (idle.length) {
    L.push("", "━━━━━━━━━━━━━━━", `⚠️ No activity today: ${idle.map((r) => r.name).join(", ")}`);
  }

  L.push("", PULSE_FOOTER);
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

// ───────────────────────────── the telecaller's own review ─────────────────
//
// A different message from repText(), on purpose. repText is the rep's slice of
// the founder's report — what happened. This is a review: what happened, what
// it scored, and the ONE thing to do about it tomorrow.
//
// Two rules run through every line, and both came from the founder:
//
//   1. NEVER a bare score. "Score: 12/100" arriving on a telecaller's phone at
//      7pm is not feedback, it is an insult with a number attached, and the rep
//      stops opening the message after the second one. The score is always
//      surrounded by the counts that produced it and followed by something to
//      do — so a bad day reads as "here is what slipped and here is tomorrow's
//      first move", not as a verdict.
//   2. A rep who did nothing gets NO score at all. Zero activity is an
//      attendance question for their manager, not a performance number to send
//      the person. They get the facts and a starting point instead.

export type RepScore = {
  salesperson_id: string;
  date: string;
  score: number | null;
  active: boolean;
  components: { key: string; label: string; weight: number; ratio: number; detail: string }[];
  facts: {
    dialled: number; connected: number; talk_seconds: number; looped: number;
    followups_scheduled: number; followups_completed: number; followups_missed: number;
    followups_backlog: number; new_leads: number; answered_fast: number; visits_fixed: number;
  };
};

function mins(seconds: number): string {
  return seconds >= 3600
    ? `${Math.floor(seconds / 3600)}h ${Math.round((seconds % 3600) / 60)}m`
    : `${Math.round(seconds / 60)}m`;
}

/**
 * Tomorrow's single mission, picked from the weakest thing that is also the
 * most fixable.
 *
 * One mission, never a list. A rep given five things to improve does none of
 * them; a rep given "clear the 3 missed callbacks before 11 AM" either did it
 * or did not, and both of us can see which.
 *
 * The order is deliberate — a missed callback is a person waiting by a phone,
 * which beats every efficiency metric underneath it.
 */
function mission(f: RepScore["facts"]): string {
  if (f.followups_missed > 0) {
    return `Clear the ${f.followups_missed} missed follow-up${f.followups_missed > 1 ? "s" : ""} before 11 AM.`;
  }
  if (f.new_leads > f.answered_fast) {
    const late = f.new_leads - f.answered_fast;
    return `${late} new lead${late > 1 ? "s" : ""} waited more than 2 hours for a call. Ring every new lead the same hour it arrives.`;
  }
  if (f.followups_backlog > 0) {
    const take = Math.min(5, f.followups_backlog);
    return `${f.followups_backlog} customers have been waiting since before today. Call the ${take} oldest first.`;
  }
  if (f.connected > 0 && f.looped < f.connected) {
    const open = f.connected - f.looped;
    return `${open} call${open > 1 ? "s" : ""} ended with no next step. Book the next call before you hang up.`;
  }
  if (f.connected < 30) {
    return `Aim for 30 connected calls. You got ${f.connected} today.`;
  }
  return "Same again tomorrow — this is what a good day looks like.";
}

/** The one line at the end. Earned, not automatic. */
function closingLine(score: number | null): string {
  if (score === null) return "Tomorrow is a fresh start.";
  if (score >= 85) return "Excellent day. Keep this going.";
  if (score >= 60) return "Solid day. One more push tomorrow.";
  return "Keep going — you can improve this tomorrow.";
}

export function repReviewText(s: RepScore, name: string, companyName?: string | null): string {
  const f = s.facts;
  const L: string[] = ["📊 Today's Sales Review",
    `${name}${companyName ? ` · ${companyName}` : ""} · ${prettyDate(s.date)}`];

  // The idle day. No score, no scolding, and still a first move for tomorrow.
  if (!s.active) {
    L.push("", "No calls logged today.");
    if (f.followups_backlog + f.followups_missed > 0) {
      const waiting = f.followups_backlog + f.followups_missed;
      L.push(`⚠️ ${waiting} customer${waiting > 1 ? "s are" : " is"} waiting for a callback.`);
    }
    L.push("", "🎯 Tomorrow's mission", mission(f));
    L.push("", "Tomorrow is a fresh start.", "", PULSE_FOOTER);
    return L.join("\n");
  }

  L.push("", `Score: ${s.score}/100`);

  L.push("");
  if (f.followups_completed > 0) {
    L.push(`✅ You completed ${f.followups_completed} follow-up${f.followups_completed > 1 ? "s" : ""}.`);
  }
  if (f.followups_missed > 0) {
    L.push(`⚠️ ${f.followups_missed} follow-up${f.followups_missed > 1 ? "s were" : " was"} missed.`);
  }
  if (f.followups_backlog > 0) {
    L.push(`⚠️ ${f.followups_backlog} customer${f.followups_backlog > 1 ? "s are" : " is"} still waiting from earlier days.`);
  }
  if (f.connected > 0) {
    L.push(`📞 ${f.connected} call${f.connected > 1 ? "s" : ""} connected · ${mins(f.talk_seconds)} talk.`);
  }
  if (f.visits_fixed > 0) {
    L.push(`📍 ${f.visits_fixed} site visit${f.visits_fixed > 1 ? "s" : ""} fixed.`);
  }

  // What the number is made of. Shown every time, because a score whose
  // arithmetic is hidden is a score the rep argues with instead of acting on.
  if (s.components.length) {
    L.push("", "📈 Score built from");
    for (const c of s.components) L.push(`• ${c.label} — ${c.detail}`);
  }

  L.push("", "🎯 Tomorrow's mission", mission(f));
  L.push("", closingLine(s.score), "", PULSE_FOOTER);
  return L.join("\n");
}

/**
 * Monday morning, about the week just finished.
 *
 * Strengths and weaknesses here are MEASURED, not guessed: the best and worst
 * component of the week's own score. The brief asked for "Best skill: handling
 * objections" — that reading needs the call transcripts put through the
 * coaching brain, and it will say so once it can. Naming a skill we have not
 * measured would be the same mistake as scoring notes nobody writes.
 */
export type RepWeek = {
  from: string; to: string;
  calls: number; connected: number; talkSeconds: number;
  bookings: number; siteVisits: number;
  followupsScheduled: number; followupsCompleted: number;
  best: { label: string; detail: string } | null;
  worst: { label: string; detail: string } | null;
  avgScore: number | null;
};

export function repWeeklyText(w: RepWeek, name: string, companyName?: string | null): string {
  const L: string[] = ["📅 Weekly Review",
    `${name}${companyName ? ` · ${companyName}` : ""}`,
    `${w.from} – ${w.to}`];

  if (w.avgScore !== null) L.push("", `Average score: ${w.avgScore}/100`);

  L.push("", "🟢 The week",
    `📞 Calls: ${w.calls} · ${w.connected} connected · ${mins(w.talkSeconds)} talk`,
    `🔁 Follow-ups: ${w.followupsCompleted} of ${w.followupsScheduled} kept`,
    `📍 Site visits: ${w.siteVisits}`,
    `🎉 Bookings: ${w.bookings}`);

  if (w.best) L.push("", "💪 Strongest this week", `${w.best.label} — ${w.best.detail}`);
  if (w.worst) L.push("", "📈 Needs improvement", `${w.worst.label} — ${w.worst.detail}`);

  L.push("", w.bookings > 0
    ? "You closed business this week. Do more of whatever that was."
    : "No bookings yet this week. The site visits are where they come from.",
    "", PULSE_FOOTER);
  return L.join("\n");
}
