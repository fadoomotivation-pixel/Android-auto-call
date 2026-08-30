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
  /** Calls to numbers that are NOT CRM leads, under record-all-calls. Never
   *  counted as work — but never hidden either. A rep on the phone for 45
   *  minutes to non-leads is not the same story as a rep who did nothing, and
   *  "0 calls | 0m talk" told the founder they were the same. */
  offCrmCalls: number;
  offCrmTalkSeconds: number;
  voiceNotes: { summary: string | null; lead: string; disposition: string | null; audioPath: string | null }[];
  moves: { detail: string; lead: string; byAi: boolean }[];
  /** Whose visit is DATED today. A date is a promise, not attendance. */
  siteVisits: string[];
  /** Who actually turned up — site_visit_arrived_at stamped today. The only
   *  evidence in this system that a customer was ever on site. */
  visitsArrived: string[];
  followUps: number;
  hotLeads: number;
  /** WhatsApp the rep sent by hand, observed from their own number — see
   *  v_rep_whatsapp_daily. Zero for a rep with no observer connected, which is
   *  indistinguishable from a rep who sent nothing; the report never claims
   *  otherwise, it just does not mention WhatsApp for them. */
  waMessages: number;
  /** Distinct leads messaged. One rep sending six files to one buyer is one. */
  waLeads: number;
  /** Leads who were sent a PDF, image, video or link. A voice note is not
   *  details — see migration 0168. */
  waDetails: number;
  /** Leads who wrote BACK. The one number here a rep cannot inflate. */
  waReplies: number;
  /** Median minutes to answer a buyer today. null when no buyer wrote, or none
   *  was ever answered. Counting messages rewards sending more; this needs the
   *  BUYER to have spoken first, so it is the honest speed number. */
  waReplyMins: number | null;
  /** Buyers whose last WhatsApp message is still unanswered RIGHT NOW.
   *
   *  Not a day figure and deliberately so: a buyer who asked a question at 4pm
   *  and is still waiting at 7pm is the most valuable line in this whole
   *  report. Everything else here says what happened; this says what is still
   *  owed. */
  waWaiting: number;
  /** The one who has waited longest, for the report to name. */
  waWaitingWorst: { name: string; minutes: number } | null;
  /** Buyer messages today that read as ready-to-move / about-to-walk, from a
   *  plain keyword read of their own WhatsApp text — migration 0175. Zero for
   *  a rep with no observer, same as every other WhatsApp field here. */
  waHot: number;
  waRisk: number;
  /** The one risk message worth quoting — a bare count gets skimmed, a quote
   *  gets a founder to actually call the rep. Only ever a buyer's own words. */
  waRiskHit: { name: string; text: string } | null;
  /** "none" = no observer set up for this rep, so WhatsApp is simply not part
   *  of their report. "ok" = watching. "stale" = a session exists and has said
   *  nothing for two hours, which means 0 is UNKNOWN, not zero — the same
   *  distinction callsTrusted draws for the phone's call log. */
  waWatch: "none" | "ok" | "stale";
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
  /**
   * Can the call numbers above be believed?
   *
   * FALSE means this phone has not successfully synced its call log recently —
   * so `calls` and `connected` are what the CRM RECEIVED, which on a broken
   * phone is zero no matter how hard the rep worked. Straight from
   * v_device_sync_health.trustworthy, which has always known this.
   */
  callsTrusted: boolean;
  /** The raw staleness answer from v_device_sync_health, kept so a phone that
   *  delivered today but has since gone quiet can carry a soft note instead of
   *  the hard "not reporting" warning. */
  rawTrusted?: boolean;
  /** When the phone last synced call logs successfully, for the warning line. */
  syncedAt: string | null;
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

  // ELEVEN QUERIES, ONE ROUND TRIP.
  //
  // profiles, contacts and lead_stages used to be three awaits in a row before
  // the batch below even started, so every company cost four sequential waits
  // instead of one. None of the three depends on the others — they were
  // sequential only because they were written on separate lines. On the Daily
  // Pulse page, where the super admin builds eight companies, that was
  // twenty-four avoidable round trips before a single call log was read.
  const [
    { data: reps },
    { data: contacts },
    { data: saleStages },
    calls,
    notes,
    acts,
    visits,
    fups,
    hot,
    steps,
    health,
    whatsapp,
    waAwaiting,
    waSessions,
    signals,
    signalHits,
  ] = await Promise.all([
    admin.from("profiles")
      .select("id, full_name").eq("company_id", companyId).eq("role", "salesperson"),
    // Contact names for pretty labels. Explicit limit: PostgREST silently caps
    // an unlimited select at 1000 rows, and the two biggest tenants are already
    // past 300 and taking twenty Facebook leads a day. Truncating here would not
    // error — it would quietly start labelling real leads "lead" and, worse,
    // drop them out of leadStage so a sale stopped counting as a sale.
    admin.from("contacts")
      .select("id, name, phone, stage").eq("company_id", companyId).limit(50000),
    // WHICH STAGES ARE A SALE — asked of the table that defines them, never
    // guessed. lead_stages.counts_as_sale is true for token_paid and won, and it
    // is the same column the pipeline, analytics and the web dashboard read.
    admin.from("lead_stages").select("code").eq("counts_as_sale", true),
    // started_at, not created_at: the phone's call-log sync backfills a week of
    // history the first time it runs, and every one of those rows is created
    // TODAY — which reported a whole week as one day's work. off_crm calls are
    // the rep's own and never counted as work.
    // off_crm rows are FETCHED now and split in code. They are still never
    // counted as work; they are reported on their own line so a founder can
    // tell "did nothing" from "was on the phone, just not to our leads".
    // Explicit limit. Dropping the off_crm filter multiplies the rows this
    // returns — under record-all-calls the off-CRM ones can be the majority
    // (Ankita: 33 of 33 today) — and PostgREST silently caps an unlimited
    // select at 1000. Fanbe logged 4792 rows in a single day on 2 Aug, so a
    // truncated read here would under-report the day with no error at all.
    admin.from("call_logs").select("salesperson_id, contact_id, phone, outcome, duration_seconds, off_crm")
      .eq("company_id", companyId).gte("started_at", start).lte("started_at", end)
      .limit(20000),
    admin.from("lead_voice_notes").select("actor_id, contact_id, summary, suggested_disposition, audio_path")
      .eq("company_id", companyId).gte("created_at", start).lte("created_at", end),
    admin.from("lead_activities").select("actor_id, actor_name, contact_id, detail, type")
      .eq("company_id", companyId).gte("created_at", start).lte("created_at", end)
      .in("type", ["status", "site_visit", "follow_up", "budget", "temperature"]),
    // site_visit_arrived_at comes along because a DATE IS NOT AN ARRIVAL. The
    // app already refuses to call a visit done without this stamp; the founder's
    // report was the one place still treating the two as the same thing.
    admin.from("contacts").select("salesperson_id, name, phone, site_visit_at, site_visit_arrived_at")
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
    // CAN WE BELIEVE THE CALL NUMBERS AT ALL?
    //
    // This view has answered that since the day it was written and the report
    // never asked. On 6 Aug the founder was sent "Ankita — 0 calls, 0
    // connected" for a day she recorded 49 voice notes and moved 130 leads
    // between 1:23pm and 5:32pm. Her Xiaomi had not synced a call log since the
    // 5th: last_ok_at NULL, native_seen 0, trustworthy FALSE.
    //
    // Zero was what the CRM RECEIVED. The report printed it as what she did.
    admin.from("v_device_sync_health").select("salesperson_id, last_ok_at, trustworthy")
      .eq("company_id", companyId),
    // WHATSAPP THE REP SENT BY HAND. Migration 0167/0168: a read-only observer
    // on the rep's own number, filtered server-side to leads of this company
    // only. Until now the pulse could not see WhatsApp at all, so a rep who
    // spent the afternoon sending plot layouts read as a rep who did nothing.
    //
    // day_ist is already the IST calendar day, so this matches on the date
    // string rather than the timestamp bounds the other queries use.
    admin.from("v_rep_whatsapp_daily")
      .select("salesperson_id, messages_sent, leads_messaged, leads_given_details, leads_who_replied, median_reply_minutes")
      .eq("company_id", companyId).eq("day_ist", date),
    // WHO IS STILL WAITING FOR AN ANSWER. Live, not day-scoped, and that is the
    // point: a buyer who asked a question this afternoon and has had no reply
    // by 7pm is the most actionable thing the report can say. Every other line
    // describes what happened; this one describes what is still owed.
    admin.from("v_wa_awaiting_reply")
      .select("salesperson_id, lead_name, waiting_minutes")
      .eq("company_id", companyId),
    // IS ANYONE STILL LISTENING? Without this, a watcher that died at 11am is
    // indistinguishable from a rep who sent nothing — and the report would
    // print the second story. Exactly the mistake callsTrusted exists to stop
    // the call numbers making.
    admin.from("wa_rep_sessions").select("salesperson_id, last_seen_at")
      .eq("company_id", companyId),
    // WHAT THE BUYER ACTUALLY SAID. Migration 0175: every incoming WhatsApp
    // message is read, once, for plain keyword signals the moment it lands —
    // "site visit", "book", "token" read as ready to move; "cancel", "other
    // builder", "too expensive" read as about to walk. Counted per rep per
    // IST day, same shape as v_rep_whatsapp_daily.
    admin.from("v_wa_signals_daily").select("salesperson_id, hot_count, risk_count")
      .eq("company_id", companyId).eq("day_ist", date),
    // The one message worth quoting, not just counting — rn = 1 is the most
    // recent hit per rep per signal per day (view does the ranking).
    admin.from("v_wa_signal_hits").select("salesperson_id, signal, lead_name, body")
      .eq("company_id", companyId).eq("day_ist", date).eq("rn", 1).eq("signal", "risk"),
  ]);

  const repList = reps ?? [];
  const nameById = new Map(repList.map((r) => [r.id, r.full_name || "Telecaller"]));
  const leadName = new Map((contacts ?? []).map((c) => [c.id, c.name || c.phone || "lead"]));
  const leadStage = new Map((contacts ?? []).map((c) => [c.id, String(c.stage ?? "")]));
  const SALE = new Set((saleStages ?? []).map((r) => String(r.code)));

  const map = new Map<string, RepPulse>();
  const rep = (id: string | null): RepPulse | null => {
    if (!id || !nameById.has(id)) return null;
    if (!map.has(id)) {
      map.set(id, {
        id, name: nameById.get(id)!, calls: 0, connected: 0, talkSeconds: 0,
        offCrmCalls: 0, offCrmTalkSeconds: 0,
        voiceNotes: [], moves: [], siteVisits: [], visitsArrived: [], followUps: 0, hotLeads: 0,
        waMessages: 0, waLeads: 0, waDetails: 0, waReplies: 0, waWatch: "none",
        waReplyMins: null, waWaiting: 0, waWaitingWorst: null,
        waHot: 0, waRisk: 0, waRiskHit: null,
        topLeads: [], noConnect: [], nextSteps: [], visitsFixed: 0, bookings: 0,
        revenue: 0, aiUpdates: [], callsTrusted: true, syncedAt: null,
      });
    }
    return map.get(id)!;
  };

  // WhatsApp, straight onto the rep. Nothing to reconcile: the view is already
  // one row per rep per IST day.
  // whatsapp.data, not whatsapp: the entries in this Promise.all that are not
  // destructured as { data } are the full PostgrestResponse, the way health,
  // hot and steps are read below.
  // Two hours, the same threshold v_rep_whatsapp_health uses and the admin
  // dashboard shows. Set BEFORE the counts, so a rep with a session but no
  // messages still gets "stale" rather than silence.
  for (const sn of (waSessions.data ?? []) as Record<string, unknown>[]) {
    const r = rep(String(sn.salesperson_id ?? ""));
    if (!r) continue;
    const seen = sn.last_seen_at ? new Date(String(sn.last_seen_at)).getTime() : 0;
    r.waWatch = seen && Date.now() - seen < 2 * 3600_000 ? "ok" : "stale";
  }

  for (const w of (whatsapp.data ?? []) as Record<string, unknown>[]) {
    const r = rep(String(w.salesperson_id ?? ""));
    if (!r) continue;
    r.waMessages = Number(w.messages_sent ?? 0);
    r.waLeads = Number(w.leads_messaged ?? 0);
    r.waDetails = Number(w.leads_given_details ?? 0);
    r.waReplies = Number(w.leads_who_replied ?? 0);
    r.waReplyMins = w.median_reply_minutes === null || w.median_reply_minutes === undefined
      ? null
      : Number(w.median_reply_minutes);
  }

  // Still owed an answer. Counted per rep, and the longest wait kept so the
  // report can name one buyer rather than print a bare number nobody acts on.
  for (const a of (waAwaiting.data ?? []) as Record<string, unknown>[]) {
    const r = rep(String(a.salesperson_id ?? ""));
    if (!r) continue;
    r.waWaiting += 1;
    const mins = Number(a.waiting_minutes ?? 0);
    if (!r.waWaitingWorst || mins > r.waWaitingWorst.minutes) {
      r.waWaitingWorst = { name: String(a.lead_name ?? "a buyer"), minutes: mins };
    }
  }

  // The buyer's own words, read once for plain signals — never a rating of
  // the rep. A buyer going quiet after "we found another builder" is not
  // something the rep did; it is something the rep needs to know happened.
  for (const s of (signals.data ?? []) as Record<string, unknown>[]) {
    const r = rep(String(s.salesperson_id ?? ""));
    if (!r) continue;
    r.waHot = Number(s.hot_count ?? 0);
    r.waRisk = Number(s.risk_count ?? 0);
  }
  for (const h of (signalHits.data ?? []) as Record<string, unknown>[]) {
    const r = rep(String(h.salesperson_id ?? ""));
    if (!r) continue;
    r.waRiskHit = { name: String(h.lead_name ?? "a buyer"), text: String(h.body ?? "") };
  }

  // Per rep, per lead: how long they actually talked, and whether they ever
  // got through. One lead dialled six times is ONE name on the list, not six.
  const perLead = new Map<string, Map<string, { talk: number; connected: boolean }>>();
  for (const c of calls.data ?? []) {
    const r = rep(c.salesperson_id); if (!r) continue;
    const dur = c.duration_seconds ?? 0;
    if (c.off_crm) {
      // Counted separately, and it never reaches perLead — an off-CRM number
      // is not a lead and must not appear in "who you spoke to".
      r.offCrmCalls++;
      r.offCrmTalkSeconds += dur;
      continue;
    }
    r.calls++;
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
  //
  // THE PULSE COULD NOT REPORT A SALE. This used to test the activity's prose
  // with /\bbook(ed|ing)\b/i, and nothing the app writes contains that word:
  // every status line reads "Stage → Callback", "Stage → Lost", "Stage → Site
  // Visit". A closed deal writes "Stage → Won". Across thirty days of activity
  // not one row matched, so a founder could have sold ten plots and read a
  // report that mentioned none of them.
  //
  // The taxonomy has answered this all along — lead_stages.counts_as_sale, true
  // for token_paid and won. Asking the table also means a stage added next
  // month is counted the day it is added, with no code change and no second
  // opinion for the web dashboard to disagree with.
  const bookedByRep = new Map<string, Set<string>>();
  for (const a of acts.data ?? []) {
    const r = rep(a.actor_id); if (!r || !a.contact_id) continue;
    if (a.type === "status" && SALE.has(leadStage.get(String(a.contact_id)) ?? "")) {
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
    const who = v.name || v.phone || "lead";
    r.siteVisits.push(who);
    if (v.site_visit_arrived_at) r.visitsArrived.push(who);
  }
  for (const h of health.data ?? []) {
    const r = map.get(String(h.salesperson_id)); if (!r) continue;
    // A PHONE THAT ALREADY DELIVERED TODAY IS NOT "NOT REPORTING".
    //
    // v_device_sync_health.trustworthy goes false three hours after the last
    // successful scan. That is the right rule for Phone Health, which asks "is
    // this handset alive right now". It is the wrong rule for an evening
    // report: at 11pm a rep who finished at 7pm has a four-hour-old sync and is
    // perfectly fine. Ankita was flagged "calls not counted" tonight while 47
    // of her calls were sitting in this very query, alongside 39 voice notes,
    // 125 lead updates and 5 visits booked.
    //
    // Losing real numbers to a staleness clock is worse than the zero it was
    // built to prevent — that guard exists so an absent phone is not read as an
    // idle rep, and it must not turn a working day into one either. If calls
    // arrived today, the phone reported today. Say the number, and hang the
    // caveat off it instead of in place of it.
    r.rawTrusted = h.trustworthy === true;
    r.callsTrusted = h.trustworthy === true || r.calls > 0;
    r.syncedAt = (h.last_ok_at as string | null) ?? null;
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

  // THE SAME DAY, OPENED AGAIN, SHOULD NOT COST THE SAME SIX SECONDS.
  //
  // Parallelising the companies took the Daily Pulse page from 45–150 seconds
  // to about six. What is left is almost entirely this block: one AI brief per
  // active rep, and the founder opens the page several times a day to read
  // sentences that have not changed since the last time.
  //
  // So each brief is cached against a FINGERPRINT of the facts it was written
  // from, not against the date. A cache keyed on the date alone would show a
  // founder an 11am sentence at 6pm and be quietly wrong — the worst kind of
  // fast. When any of the numbers behind the sentence move, the fingerprint
  // moves with them and the brief is rewritten.
  const fingerprint = (p: RepPulse) =>
    [p.calls, p.connected, p.talkSeconds, realNotes(p).length, p.moves.length,
     p.siteVisits.length, p.visitsArrived.length, p.followUps, p.hotLeads,
     p.bookings, p.nextSteps.length].join(".");
  const cached = new Map<string, { fp: string; win: string; risk: string }>();
  try {
    const { data: rows } = await admin.from("coach_briefs")
      .select("salesperson_id, content")
      .eq("company_id", companyId).eq("brief_date", date).eq("slot", "pulse");
    for (const r of (rows ?? []) as Array<{ salesperson_id: string; content: string }>) {
      const c = JSON.parse(r.content);
      if (c && typeof c.fp === "string") cached.set(String(r.salesperson_id), c);
    }
  } catch { /* a cold cache is a slow page, not a broken one */ }

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

    const fp = fingerprint(p);
    const hit = cached.get(p.id);
    if (hit && hit.fp === fp) {
      if (hit.win) p.win = hit.win;
      if (hit.risk) p.risk = hit.risk;
      const n = [hit.win, hit.risk].filter(Boolean).join(" ");
      if (n) p.narrative = n;
      return;
    }
    // LABEL THE FACT, DON'T JUST HAND IT OVER.
    //
    // This used to pass `site_visits: ["Anuj"]` — a list of leads whose visit
    // DATE is today — and the model, reasonably, wrote that Anuj visited. The
    // two states now arrive under names that cannot be confused, and the
    // scheduled ones carry the warning in the value itself, because a model
    // skims keys and reads values.
    const facts = {
      rep: p.name,
      // Hand the model the caveat, not just the number. Given "calls: 0" it
      // will write "a quiet day for Ankita" about somebody who worked all
      // afternoon into a phone that was not reporting.
      ...(p.callsTrusted
        ? { calls: p.calls, connected: p.connected, talk: fmtDur(p.talkSeconds) }
        : { call_numbers: "UNAVAILABLE — this rep's phone is not sending its call log, so their real call count is unknown" }),
      visits_confirmed_on_site: p.visitsArrived,
      visits_only_booked_for_today_NOT_confirmed: p.siteVisits
        .filter((v) => !p.visitsArrived.includes(v))
        .map((v) => `${v} — said they would come today; nobody has confirmed they arrived`),
      follow_ups: p.followUps, hot_leads: p.hotLeads,
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
          "IF call_numbers SAYS UNAVAILABLE, you do not know how much this rep called. " +
          "Never say they were quiet, slow, idle, or made few calls — judge them ONLY on " +
          "the notes and lead moves you were given, and say the call numbers are missing " +
          "if it matters. Reporting a broken phone as a lazy rep is the worst mistake " +
          "you can make about a person.\n" +
          "This is a founder, not a supervisor: no call logs. Never write \"call did " +
          "not connect\", \"attempt 1\", \"marked cold\", \"stage changed\" or how many " +
          "seconds a call lasted. Say what it MEANS for the deal.\n" +
          "MONEY IS NOT YOURS TO CLAIM. Never say a customer paid, booked, gave a " +
          "token, blocked or held a unit, or signed anything, unless the facts you " +
          "were given say so in as many words. " +
          "A BOOKED VISIT IS NOT A VISIT. Only someone in " +
          "visits_confirmed_on_site actually came. Anyone in " +
          "visits_only_booked_for_today_NOT_confirmed said they would come and may " +
          "well not have — write \"agreed to visit\" or \"was due at the site\", " +
          "NEVER \"visited\", \"came\", \"turned up\" or \"toured\". " +
          "INVENT NOTHING ABOUT THE PROPERTY. No unit type, no BHK, no floor, no " +
          "tower, no view, no \"near the park\" unless those exact words are in the " +
          "facts. If you do not know what they liked, do not say what they liked. " +
          "A founder acts on this message and cannot check it — an invented " +
          "payment or an invented visit is the single worst thing you can do here.",
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
      // The prompt asks. This CHECKS — see grounded(). Where the database
      // already knows the answer, the model does not get a vote.
      const factsText = JSON.stringify(facts);
      const win = grounded(String(j.win ?? "").trim(), p, factsText);
      const risk = grounded(String(j.risk ?? "").trim(), p, factsText);
      if (win) p.win = win;
      if (risk) p.risk = risk;
      // The Pulse page has shown `narrative` since day one and is not part of
      // this change, so it keeps getting one — built from the same two lines.
      const n = [win, risk].filter(Boolean).join(" ");
      if (n) p.narrative = n;
      // Keyed by rep and day, one row, overwritten as the day moves — so the
      // cache cannot grow a row per call made.
      await admin.from("coach_briefs").upsert({
        salesperson_id: p.id, company_id: companyId, brief_date: date, slot: "pulse",
        content: JSON.stringify({ fp, win, risk }),
      }, { onConflict: "salesperson_id,brief_date,slot" });
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

/**
 * ZERO IS NOT A RESULT WHEN THE PHONE IS NOT REPORTING.
 *
 * "0 calls | 0 connected" against a rep's name is read by a founder as one
 * thing only: they did nothing today. On 6 Aug that sentence was sent about
 * Ankita, who had recorded 49 voice notes and moved 130 leads that afternoon —
 * her phone simply had not synced a call log since the day before.
 *
 * That is a false report about a person, which is worse than a false report
 * about a deal: the founder cannot check it, the rep is not in the room, and
 * the number looks like evidence. Where the system does not know, it now says
 * it does not know.
 */
/** "49 voice notes | 130 lead updates", skipping whichever is zero, and saying
 *  so plainly when both are — the rep may genuinely not have worked, and that
 *  is a different sentence from "we cannot see it". */
function listOfNonZero(notes: number, updates: number): string {
  const parts: string[] = [];
  if (notes > 0) parts.push(`${notes} voice note${notes > 1 ? "s" : ""}`);
  if (updates > 0) parts.push(`${updates} lead update${updates > 1 ? "s" : ""}`);
  return parts.length ? parts.join(" | ") : "nothing received from this phone today";
}

/**
 * The caveat, and only when it is the whole story.
 *
 * [staleWithData] is the softer case: calls DID arrive today and the handset
 * has since gone quiet, so the number below is real but may be short. That
 * reads very differently from a phone that has sent nothing at all, and
 * printing the harsher sentence over a working day is how a founder learns to
 * distrust the report.
 */
function staleNote(r: { calls: number; syncedAt: string | null; rawTrusted?: boolean }): string | null {
  if (r.rawTrusted !== false || r.calls === 0) return null;
  return `ℹ️ Phone last sent at ${r.syncedAt ? istTime(r.syncedAt) : "an unknown time"} — ` +
    `later calls may not be counted yet.`;
}

function syncWarning(r: { callsTrusted: boolean; syncedAt: string | null }): string | null {
  if (r.callsTrusted) return null;
  // One wording that stays true wherever it is printed. "Call numbers below"
  // was wrong in both places it landed — the single-rep block replaces them
  // with "not available", and the team block leads with notes instead.
  const since = r.syncedAt ? `since ${istDay(r.syncedAt)}` : "at all — not once";
  return `⚠️ Phone not sending call logs ${since}. Call count UNKNOWN, not zero.`;
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
/**
 * The WhatsApp line, for a rep and for the company total.
 *
 * Ordered by how hard each number is to fake. Messages is the softest — a rep
 * can send fifty in a minute. Leads is harder. Details is harder still, because
 * it needs an actual PDF, image, video or link and a voice note does not count.
 * Replies is the only one that requires the BUYER to do something, which makes
 * it the number worth reading first and the reason it is printed last, where
 * the eye lands.
 */
function waLine(k: {
  waMessages: number; waLeads: number; waDetails: number; waReplies: number;
  waReplyMins?: number | null;
}): string[] {
  const bits = [`${k.waMessages} msg`, `${k.waLeads} lead${k.waLeads === 1 ? "" : "s"}`];
  if (k.waDetails) bits.push(`${k.waDetails} got details`);
  if (k.waReplies) bits.push(`${k.waReplies} replied`);
  // Printed only when a buyer actually wrote and was answered, because
  // "answered in 0 min" out of nothing would read as a boast about silence.
  if (k.waReplyMins !== null && k.waReplyMins !== undefined) {
    bits.push(`answered in ${humanMins(k.waReplyMins)}`);
  }
  return [`• 💬 WhatsApp: ${bits.join(" · ")}`];
}

/** Minutes a person would say out loud. */
function humanMins(m: number): string {
  if (m < 1) return "under a min";
  if (m < 60) return `${Math.round(m)} min`;
  const h = m / 60;
  if (h < 24) return `${h < 10 ? h.toFixed(1).replace(/\.0$/, "") : Math.round(h)} hr`;
  return `${Math.round(h / 24)} day${Math.round(h / 24) === 1 ? "" : "s"}`;
}

/**
 * THE LINE THAT IS WORTH MONEY.
 *
 * Every other line in this report describes what already happened. This one
 * describes what is still owed: a buyer sent a WhatsApp message and nobody has
 * answered it yet. That is the highest-intent signal the CRM has — the lead
 * acted, unprompted — and until now it landed in a table nobody read.
 *
 * One name, not a list. "3 buyers waiting" is a statistic; "Rahul has been
 * waiting 4 hr" is something a rep opens WhatsApp about.
 */
function waWaitingLine(r: {
  waWaiting: number; waWaitingWorst: { name: string; minutes: number } | null;
}): string[] {
  if (!r.waWaiting || !r.waWaitingWorst) return [];
  const w = r.waWaitingWorst;
  const others = r.waWaiting - 1;
  return [
    `• 🔴 ${r.waWaiting} buyer${r.waWaiting === 1 ? "" : "s"} waiting for a WhatsApp reply` +
    ` — ${w.name}, ${humanMins(w.minutes)}${others > 0 ? ` (+${others} more)` : ""}`,
  ];
}

/** A quote that fits one line. Cut, not wrapped — a report line that spills
 *  onto a second line is the one a founder's thumb skips past. */
function quote(text: string, max = 70): string {
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/**
 * WHAT THE BUYER ACTUALLY SAID.
 *
 * Every other WhatsApp line here counts what the REP did. This is the only
 * one built from what the BUYER wrote, read once for plain signals — ready to
 * move, or about to walk. Risk gets the quote because it is the one worth a
 * founder or rep stopping to read; hot is good news and a bare count says
 * enough. Never printed as a verdict on the rep — a buyer saying "we found
 * another builder" is news about the BUYER, not a mark against whoever was
 * messaging them.
 */
function waSignalLine(r: {
  waHot: number; waRisk: number; waRiskHit: { name: string; text: string } | null;
}): string[] {
  const L: string[] = [];
  if (r.waRisk) {
    const hit = r.waRiskHit ? ` — ${r.waRiskHit.name}: "${quote(r.waRiskHit.text)}"` : "";
    L.push(`• ⚠️ ${r.waRisk} buyer message${r.waRisk === 1 ? "" : "s"} sound ready to walk${hit}`);
  }
  if (r.waHot) {
    L.push(`• 🔥 ${r.waHot} buyer message${r.waHot === 1 ? "" : "s"} sound ready to book`);
  }
  return L;
}

/**
 * ZERO IS NOT ZERO WHEN NOBODY IS LISTENING.
 *
 * A watcher that logged out at 11am produces exactly the same numbers as a rep
 * who sent nothing all day, and only one of those is the rep's fault. This is
 * the same distinction syncWarning draws for the phone's call log, in the same
 * words, because the founder should not have to learn two vocabularies for one
 * idea: the count is UNKNOWN, not zero.
 *
 * A rep with no observer at all gets nothing — WhatsApp simply is not part of
 * their report, and a warning about a feature they were never on would be noise.
 */
function waWarning(r: { waWatch: "none" | "ok" | "stale" }): string | null {
  if (r.waWatch !== "stale") return null;
  return "⚠️ WhatsApp watcher not reporting. WhatsApp count UNKNOWN, not zero.";
}

function kpiBlock(k: {
  bookings: number; revenue: number; visitsFixed: number; hotLeads: number;
  calls: number; connected: number; talkSeconds: number;
  /** Absent on the company totals block, which is a sum and always printed. */
  callsTrusted?: boolean;
  /** Present for a rep. When there were no CRM-lead calls but the phone was
   *  busy anyway, these replace the row of zeros — see below. SUPER ADMIN ONLY;
   *  the caller decides, and the default is not to show them. */
  offCrmCalls?: number;
  offCrmTalkSeconds?: number;
}, showOffCrm = false): string[] {
  const offCalls = showOffCrm ? (k.offCrmCalls ?? 0) : 0;
  const offTalk = showOffCrm ? (k.offCrmTalkSeconds ?? 0) : 0;
  const L = [`• Bookings: ${k.bookings}`];
  if (k.revenue > 0) L.push(`• Token collected: ${rupees(k.revenue)}`);
  L.push(`• Site visits fixed: ${k.visitsFixed}`);
  if (k.hotLeads) L.push(`• Hot leads: ${k.hotLeads}`);
  // Talk time back on the line, at the founder's request. It reads as one
  // sentence — "22 calls, 15 connected, 18m talk" — and it is the one thing
  // here that separates a rep who dialled all day from a rep who had
  // conversations. Dropping it when this block was rewritten lost the only
  // measure of whether the connects were worth anything.
  if (k.callsTrusted === false) {
    // No number at all, rather than a zero that reads as a verdict.
    L.push("• Calls: not available — this phone is not sending its call log");
  } else {
    L.push(
      // A ROW OF ZEROS IS NOT A REPORT. "Calls: 0 · connected 0 · 0m talk"
      // printed directly above "132 calls to numbers not in the CRM, 59m talk"
      // on a day the rep was on the phone for an hour. Both true; together they
      // read as a broken system, and a founder told twice that the phone is
      // fixed stops reading at the zero. When the only phone work was off-CRM,
      // the real numbers are the headline — labelled, so 132 can never be
      // misread as 132 lead calls.
      //
      // For everyone except the super admin the off-CRM numbers are not printed
      // at all, so this reads "Calls: 0 to leads" — true, actionable, and it
      // still does not call a rep idle. What her phone did outside the CRM is
      // not the company owner's line to read.
      (k.calls === 0 && offCalls > 0
        ? `• Calls: ${offCalls} · 0 to CRM leads`
        : k.calls === 0
        ? "• Calls: 0 to leads"
        : `• Calls: ${k.calls} · connected ${connectedLine(k.calls, k.connected)}`) +
        // Same rule as the calls line above: show the talk that actually
        // happened rather than a 0m next to an hour of phone time.
        (k.calls === 0 && offTalk > 0
          ? ` · ${fmtDur(offTalk)} talk`
          : k.talkSeconds > 0 ? ` · ${fmtDur(k.talkSeconds)} talk` : ""),
    );
    if (k.connected > 0) {
      L.push(`• Visit rate: ${Math.round((k.visitsFixed / k.connected) * 100)}% of everyone talked to`);
    }
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

/**
 * A DATE IS NOT AN ARRIVAL.
 *
 * 6 Aug 2026, Ankita's Pulse: "✅ Anuj visited the site today and showed strong
 * interest in a 2BHK unit near the park." Three inventions in one sentence.
 * Anuj had a visit BOOKED for 4pm and never came (site_visit_arrived_at null),
 * there were ZERO calls to him all day so nobody could have learned what he was
 * interested in, and site_visit_project and notes are both null — there is no
 * 2BHK and no park anywhere in this database.
 *
 * The model was not lying so much as answering the question it was asked. It
 * was handed `site_visits: ["Anuj"]`, a list built from "site_visit_at falls
 * today", under a name that says the visit HAPPENED. The app has known better
 * for months — it refuses to show a visit as done without the on-site check-in
 * — and the founder's report was the last place still treating a promise and an
 * attendance as the same fact.
 *
 * Ankita spotted it in minutes because she was there. The founder would not
 * have, and that is the whole danger: a report only gets read by someone who
 * cannot check it.
 */
// PAST TENSE ONLY. The prompt asks the model to write "agreed to visit" or "was
// due at the site" when nobody has confirmed an arrival, so those exact phrasings
// have to survive the guard — a filter that eats the wording it just demanded
// leaves the report with no win at all on a day that had a real one.
const VISIT_CLAIM =
  /\b(visited|came (?:to|in|down)\b|turned up|showed up|toured|walked through|attended|arrived|was on site|site visit (?:done|completed|happened|went))\b/i;

/**
 * Concrete product detail. Allowed ONLY when the word is somewhere in the facts
 * the model was given — a unit type, a tower, a view is either something a rep
 * recorded or something the model made up, and there is no third option.
 */
const CONCRETE_DETAIL =
  /\b(\d\s*-?\s*bhk|villa|penthouse|duplex|bungalow|park|garden|corner plot|park[- ]facing|facing|floor|tower|balcony|terrace|clubhouse|swimming pool)\b/gi;

/**
 * Drop any AI line the CRM cannot back up.
 *
 * Deliberately blunt: the line is dropped whole rather than edited down. A
 * half-corrected sentence still reads as a claim, and there is no safe way to
 * rewrite "paid the token amount to hold the unit" into something true without
 * knowing what actually happened. Losing one narrative line costs a nice
 * sentence; leaving it in costs the founder's trust in every number above it.
 *
 * Only fires when the structured facts DISAGREE. A rep whose customer really
 * did turn up, or really did pay, keeps their sentence in full.
 */
function grounded(
  line: string,
  r: { bookings: number; revenue: number; visitsArrived: string[] },
  factsText: string,
): string {
  if (!line) return line;

  // Money nobody recorded.
  if (!(r.bookings > 0 || r.revenue > 0) && MONEY_CLAIM.test(line)) return "";

  // A visit nobody checked in for.
  if (r.visitsArrived.length === 0 && VISIT_CLAIM.test(line)) return "";

  // A detail nobody wrote down. Evidence-gated rather than blacklisted, so a
  // rep who genuinely noted "3 BHK, park facing" keeps every word of it.
  const haystack = factsText.toLowerCase();
  for (const m of line.match(CONCRETE_DETAIL) ?? []) {
    const needle = m.toLowerCase().replace(/\s*-?\s*bhk$/, "bhk").replace(/\s+/g, "");
    const flat = haystack.replace(/\s+/g, "");
    if (!flat.includes(needle)) return "";
  }
  return line;
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
/**
 * The phone time that is NOT lead work, said out loud.
 *
 * Ankita was on the phone 45 minutes across 33 calls today and her Pulse card
 * read "0 calls | 0 conn. | 0m talk". Every one of those calls was to a number
 * that is not in the CRM, so by the work rule the zero is correct — and a
 * founder reading it concludes the phone is broken again, or that she did
 * nothing. Neither is true, and the third reading — "she is working, just not
 * our leads" — is the one that is both true and actionable.
 *
 * Deliberately NOT added to the calls/talk KPIs: this is not work and must not
 * inflate the numbers the business is judged on. It is its own sentence.
 */
export function offCrmLine(r: RepPulse): string | null {
  if (!r.offCrmCalls) return null;
  const t = r.offCrmTalkSeconds > 0 ? `, ${fmtDur(r.offCrmTalkSeconds)} talk` : "";
  return `📵 ${r.offCrmCalls} call${r.offCrmCalls === 1 ? "" : "s"} to numbers not in the CRM${t}` +
    (r.calls === 0 ? " — no CRM lead was called today." : ".");
}

/**
 * OFF-CRM IS THE SUPER ADMIN'S LINE AND NOBODY ELSE'S.
 *
 * What numbers a telecaller dialled that are not in the CRM is platform-level
 * information: it is how the owner of the PLATFORM tells a dead phone from a
 * rep working a private list. It is not a company owner's business and it is
 * certainly not a telecaller's, and it was going to both — on the Daily Pulse
 * WhatsApp that every pulse_subscriber receives, and on the web Pulse card.
 *
 * So every writer below takes an explicit flag and DEFAULTS TO OFF. Nothing has
 * to remember to hide it; a caller has to ask for it, and only the super admin's
 * surfaces do. WhatsApp never does — a message cannot check who is holding the
 * phone it lands on, and forwarding is one tap.
 */
export function repText(
  r: RepPulse,
  date: string,
  companyName?: string | null,
  showOffCrm = false,
): string {
  const L: string[] = [`📊 ${r.name} | Daily Pulse | ${prettyDate(date)}`];
  if (companyName) L.push(companyName);

  const warn = syncWarning(r);
  // offCrmCalls counts as activity for this test. "No calls, no notes, no lead
  // moves today" about someone who spent 45 minutes on the phone is false, and
  // it is the sentence a founder acts on.
  const idle = !r.calls && !r.offCrmCalls && !r.voiceNotes.length && !r.moves.length && !r.siteVisits.length && !r.waMessages;
  if (idle) {
    // "No activity today" about a phone that cannot report is an accusation
    // dressed as a fact. Say which one this is.
    // A dead WhatsApp watcher makes "did nothing" unsafe to say, the same way
    // a phone that is not syncing does. Lead with whichever is broken.
    const waIdleWarn = waWarning(r);
    L.push("", warn ?? waIdleWarn ?? "No calls, no notes, no lead moves today.");
    if (!warn && waIdleWarn) L.push("No calls or lead moves either — but WhatsApp cannot be checked while the watcher is down.");
    if (warn) L.push("Nothing came through from this phone at all — check it before reading anything into today.");
    // THE MOST URGENT VERSION OF THIS LINE, and it nearly did not get printed:
    // this branch returns early. A rep who did nothing all day AND is sitting on
    // an unanswered buyer is the exact person who most needs telling, so the
    // one case where the message matters most must not be the one that skips it.
    if (!waIdleWarn) {
      const waiting = waWaitingLine(r);
      const signal = waSignalLine(r);
      if (waiting.length || signal.length) L.push("", ...waiting, ...signal);
    }
    L.push("", PULSE_FOOTER);
    return L.join("\n");
  }

  if (warn) L.push("", warn);
  L.push("", "🟢 Today", ...kpiBlock(r, showOffCrm));
  // Only when there is something to say. A flat "WhatsApp: 0" on every rep who
  // has no observer connected would teach the founder to skip the line — and a
  // silent 0 from a DEAD watcher would be a lie, so that case gets the warning
  // instead of the numbers.
  const waWarn = waWarning(r);
  if (waWarn) L.push(`• ${waWarn}`);
  else if (r.waMessages) L.push(...waLine(r));
  // Printed even when they sent nothing today: a buyer waiting since yesterday
  // is MORE urgent, not less, and gating it on today's activity would hide
  // exactly the rep who has stopped answering.
  if (!waWarn) L.push(...waWaitingLine(r), ...waSignalLine(r));
  const stale = staleNote(r);
  if (stale) L.push(stale);
  const offCrm = showOffCrm ? offCrmLine(r) : null;
  if (offCrm) L.push(offCrm);

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
export function pulseText(
  p: CompanyPulse,
  companyName?: string | null,
  showOffCrm = false,
): string {
  const L: string[] = [`📊 ${companyName ? `${companyName} · ` : ""}Daily Pulse`, prettyDate(p.date)];
  // The totals are a sum of what ARRIVED. With a phone missing they are a floor,
  // not a count — and when NO phone is reporting they are not a number at all,
  // so the headline says "not available" rather than leading with a 0 that the
  // eye reads as the answer before it reaches the warning underneath.
  const blind = p.reps.filter((r) => !r.callsTrusted);
  const anyReporting = p.reps.some((r) => r.callsTrusted);
  L.push("", "🟢 Today", ...kpiBlock({ ...p.totals, callsTrusted: anyReporting || p.reps.length === 0 }, showOffCrm));
  // Summed across reps rather than carried on p.totals: WhatsApp arrives per
  // rep from its own view and the totals object is built from call data.
  const waTeam = p.reps.reduce((a, r) => ({
    waMessages: a.waMessages + r.waMessages,
    waLeads: a.waLeads + r.waLeads,
    waDetails: a.waDetails + r.waDetails,
    waReplies: a.waReplies + r.waReplies,
    waHot: a.waHot + r.waHot,
  }), { waMessages: 0, waLeads: 0, waDetails: 0, waReplies: 0, waHot: 0 });
  if (waTeam.waMessages) L.push(...waLine(waTeam));
  if (waTeam.waHot) {
    L.push(`• 🔥 ${waTeam.waHot} buyer message${waTeam.waHot === 1 ? "" : "s"} across the team sound ready to book`);
  }

  // RISK, NAMED BY REP — the same treatment as buyers still waiting, because
  // it is the same kind of line: a total tells the founder there is something,
  // the names make it tonight's first conversation instead of a statistic.
  const riskReps = p.reps.filter((r) => r.waRisk > 0).sort((a, b) => b.waRisk - a.waRisk);
  if (riskReps.length) {
    const total = riskReps.reduce((n, r) => n + r.waRisk, 0);
    L.push(`• ⚠️ ${total} buyer message${total === 1 ? "" : "s"} across the team sound ready to walk:`);
    for (const r of riskReps) {
      const hit = r.waRiskHit ? ` — "${quote(r.waRiskHit.text, 55)}"` : "";
      L.push(`   ${r.name} — ${r.waRisk}${hit}`);
    }
  }

  // BUYERS STILL WAITING, NAMED BY REP.
  //
  // The team total on its own ("5 buyers waiting") tells a founder there is a
  // problem but not who owns it, and a founder who cannot act on a line stops
  // reading it. Named by rep, worst wait first, it becomes tomorrow morning's
  // first conversation.
  const waitingReps = p.reps
    .filter((r) => r.waWaiting > 0 && r.waWatch !== "stale")
    .sort((a, b) => (b.waWaitingWorst?.minutes ?? 0) - (a.waWaitingWorst?.minutes ?? 0));
  if (waitingReps.length) {
    const total = waitingReps.reduce((n, r) => n + r.waWaiting, 0);
    L.push(`• 🔴 ${total} buyer${total === 1 ? "" : "s"} waiting for a WhatsApp reply:`);
    for (const r of waitingReps) {
      L.push(`   ${r.name} — ${r.waWaiting} (longest ${humanMins(r.waWaitingWorst!.minutes)})`);
    }
  }

  // Named, not summarised. "2 watchers down" makes a founder go looking; the
  // names make them act, and it is the same treatment the blind phones get.
  const waBlind = p.reps.filter((r) => r.waWatch === "stale");
  if (waBlind.length) {
    L.push(`• ⚠️ WhatsApp UNKNOWN for ${waBlind.length} rep${waBlind.length > 1 ? "s" : ""} — watcher not reporting (${
      waBlind.map((r) => r.name).join(", ")})`);
  }
  if (blind.length) {
    L.push(`• ⚠️ Call totals are INCOMPLETE — ${blind.length} phone${blind.length > 1 ? "s" : ""} not reporting (${
      blind.map((r) => r.name).join(", ")})`);
  }

  // offCrmCalls counts here too. Ankita made 33 calls today and would have been
  // filed under "idle" — a founder reading that about someone who was on the
  // phone for 45 minutes stops trusting the report, which is how we got here.
  const worked = p.reps.filter((r) =>
    r.calls || r.offCrmCalls || r.voiceNotes.length || r.moves.length || r.siteVisits.length);
  const idle = p.reps.filter((r) => !worked.includes(r));

  // The same shape as the single-rep message, tightened to four lines a rep.
  // Five reps' worth of voice-note summaries, lead-move logs and no-connect
  // lists was a message that had to be split across three WhatsApps before the
  // founder had read a single decision.
  for (const r of worked) {
    L.push("", "━━━━━━━━━━━━━━━", `👤 ${r.name}`);
    const warn = syncWarning(r);
    if (warn) L.push(warn);
    // With no trustworthy call log, lead the line with what we DO know she did
    // — the notes and the moves are hers and they arrived.
    // With no trustworthy call log, lead with what DID arrive and is hers.
    // Only the halves that have a number in them: "0 voice notes | 67 lead
    // updates" reads like a complaint about the zero.
    const didArrive = listOfNonZero(realNotes(r).length, newsworthyMoves(r).length)
    // Same rule again — the founder's team report showed "0 calls | 0
    // connected" beside a rep who had been on the phone for an hour.
    const callsBit = r.calls === 0 && showOffCrm && r.offCrmCalls > 0
      ? `${r.offCrmCalls} calls | 0 to CRM leads`
      : r.calls === 0
      ? "0 calls to leads"
      : `${r.calls} calls | ${connectedLine(r.calls, r.connected)} connected`
    L.push((warn ? didArrive : callsBit) +
      (r.hotLeads ? ` | 🔥 ${r.hotLeads} hot` : "") +
      (r.visitsFixed ? ` | 📍 ${r.visitsFixed} visit${r.visitsFixed > 1 ? "s" : ""} fixed` : "") +
      (r.bookings ? ` | 🎉 ${r.bookings} booked${r.revenue ? ` ${rupees(r.revenue)}` : ""}` : ""));
    const stale = staleNote(r);
    if (stale) L.push(stale);
    const offCrm = showOffCrm ? offCrmLine(r) : null;
    if (offCrm) L.push(offCrm);
    if (r.win) L.push(`✅ ${r.win}`);
    if (r.risk) L.push(`🔸 ${r.risk}`);
    r.nextSteps.slice(0, 2).forEach((s) => L.push(`🎯 Next: ${s.lead} — ${s.when}`));
    r.aiUpdates.forEach((u) => L.push(`🤖 ${u}`));
  }

  if (idle.length) {
    // Two very different sentences. Lumping a rep whose phone stopped
    // reporting in with a rep who did not work is how someone gets a talking-to
    // they did not earn.
    const quiet = idle.filter((r) => r.callsTrusted);
    const broken = idle.filter((r) => !r.callsTrusted);
    L.push("", "━━━━━━━━━━━━━━━");
    if (quiet.length) L.push(`⚠️ No activity today: ${quiet.map((r) => r.name).join(", ")}`);
    if (broken.length) {
      L.push(`📵 Nothing received from these phones — fix the phone before judging the day: ${
        broken.map((r) => r.name).join(", ")}`);
    }
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
