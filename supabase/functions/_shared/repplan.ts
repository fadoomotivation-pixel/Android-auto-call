// A telecaller's day plan, written for HER — the Daily Pulse she receives.
//
// 24 Oct, Nidhi's pulse said "19 things you said on a call are still not done
// — Tell price details later for Mamta, 8 days (+18 more)", then "Priority
// next: Amit — 11:00 am" for a callback that had been missed that morning, and
// warned "WhatsApp watcher not reporting" while 883 of her messages had
// arrived that day. The founder: "ab +18 se uske kya pta chalega" — what does
// "+18" tell her? And: "android me kuch or aaye, waha kuch or".
//
// That message was the FOUNDER's report about her (repText, with an AI "win"
// and "risk" written for a manager) re-addressed to her. This one is written
// for the person who has to do the work tomorrow:
//
//   • every list comes from rep_plan() (migration 0236) — the same function
//     the Android app and the /app web app read, so a count here is the count
//     on her screen, and "+N more" names the exact place where the rest are;
//   • every person carries a phone number WhatsApp turns into a tap;
//   • what she promised is grouped by what she has to DO (send / fix the visit
//     / call back with an answer), because that is how the work gets done;
//   • one tip, from HER recorded calls, her persona and the company's own
//     playbook — stored as the day's coach tip, so the app's coach says the
//     same thing the WhatsApp said.
import { type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { askJson } from "./chat.ts";
import { fmtDur, PULSE_FOOTER, type RepPulse } from "./pulse.ts";

export type PlanPromiseItem = {
  kind: string; promise: string; quote: string | null; days: number; late: boolean; said_at: string;
};

export type RepPlan = {
  rep: string;
  at: string;
  /** The IST day the plan is for: today until noon, tomorrow after. */
  plan_day: string;
  counts: {
    call_now: number; promise_people: number; promises: number; promises_late: number;
    waiting: number; visits: number; visits_pending: number; drafts: number;
  };
  call_now: {
    contact_id: string; name: string | null; phone: string | null; tier: number;
    due_at: string | null; waiting_since: string | null; promise_since: string | null;
    promise: string | null; calls: number; best_call_seconds: number;
    last_call_at: string | null; memory: string | null; stage: string | null;
  }[];
  promises: {
    contact_id: string; name: string | null; phone: string | null; stage: string | null;
    /** A promise names the plan's day ("Fix Sunday site visit" on a Saturday night). */
    late: boolean; oldest_days: number; names_day?: boolean; items: PlanPromiseItem[];
  }[];
  waiting: {
    contact_id: string; name: string | null; phone: string | null;
    since: string; minutes: number; text: string | null; media: string | null;
  }[];
  visits: { contact_id: string; name: string | null; phone: string | null; at: string; project: string | null }[];
  visits_pending: {
    contact_id: string; name: string | null; phone: string | null; visit_at: string; days_waiting: number | null;
  }[];
  drafts: { id: string; contact_id: string; name: string | null; phone: string | null; body: string; created_at: string }[];
};

/** The section names. The app's Today's Plan uses the same words, so "+3 more
 *  in You said you would" is a place she can find. */
export const PLAN_SECTIONS = {
  waiting: "Waiting for your reply",
  visits: "Site visit fixed",
  promises: "You said you would",
  drafts: "WhatsApp ready",
  callNow: "Call now",
  pending: "Waiting on an outcome",
} as const;

export async function loadRepPlan(admin: SupabaseClient, repId: string, limit = 50): Promise<RepPlan | null> {
  const { data, error } = await admin.rpc("rep_plan", { p_rep: repId, p_limit: limit });
  if (error || !data) return null;
  return data as RepPlan;
}

// ---------------------------------------------------------------------------
// Small words
// ---------------------------------------------------------------------------

const IST_MS = 5.5 * 3600 * 1000;

function istDateOf(iso: string): string {
  return new Date(new Date(iso).getTime() + IST_MS).toISOString().slice(0, 10);
}

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true,
  }).toUpperCase();
}

function weekdayOf(dateIst: string): string {
  return new Date(`${dateIst}T12:00:00+05:30`).toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata", weekday: "short",
  });
}

function prettyDay(dateIst: string): string {
  return new Date(`${dateIst}T12:00:00+05:30`).toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short",
  });
}

/** "+91 96500 21842" — a number WhatsApp turns into Call / Message. */
export function phoneLabel(raw: string | null): string {
  const s = String(raw ?? "").trim();
  const d = s.replace(/\D/g, "");
  if (d.length === 10) return `+91 ${d.slice(0, 5)} ${d.slice(5)}`;
  if (d.length === 12 && d.startsWith("91")) return `+91 ${d.slice(2, 7)} ${d.slice(7)}`;
  return s.startsWith("+") ? `+${d}` : s;
}

/** "karuti" → "Karuti". A name someone typed in capitals is left alone. */
export function prettyName(name: string | null, phone: string | null): string {
  const n = String(name ?? "").replace(/\s+/g, " ").trim();
  if (!n) return phoneLabel(phone) || "A lead";
  return n.split(" ").map((w) => (w === w.toLowerCase() ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(" ");
}

function clip(s: string | null | undefined, n: number): string {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

function waited(minutes: number): string {
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))} min`;
  const h = minutes / 60;
  if (h < 24) return `${Math.round(h)} hr`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"}`;
}

function age(days: number): string {
  if (days <= 0) return "";
  if (days === 1) return "since yesterday";
  return `${days} days`;
}

/** Android's agoLabel, word for word: "just now" · "40m ago" · "3h ago" · "2d ago". */
function agoOf(iso: string): string {
  const min = Math.floor((Date.now() - Date.parse(iso)) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  if (min < 1440) return `${Math.floor(min / 60)}h ago`;
  return `${Math.floor(min / 1440)}d ago`;
}

/**
 * Why this person is in Call now — the same words, in the same order, as the
 * app's own row (TelecallerScreens.kt dueSignal): the buyer wrote, then a
 * promise, then a number that never picks up. Then what was said last time.
 */
export function callReason(r: RepPlan["call_now"][number]): string {
  if (r.waiting_since) return `They wrote ${agoOf(r.waiting_since)} — no reply yet`;
  if (r.promise_since && r.promise) return `You said: ${clip(r.promise, 50)} · ${agoOf(r.promise_since)}`;
  if (r.best_call_seconds === 0 && r.calls >= 4) return `Rung ${r.calls} times — never picked up`;
  if (r.memory) return clip(r.memory, 70);
  if (r.tier === 2) return "You spoke before";
  return r.calls === 0 ? "Not called yet" : "Not reached yet";
}

const KIND_HEAD: Record<string, string> = {
  send: "Send on WhatsApp:",
  visit: "Fix the visit day:",
  price_check: "Call back with an answer:",
};

/** "sunday" — to match a promise that names the plan's day. */
function weekdayLong(dateIst: string): string {
  return new Date(`${dateIst}T12:00:00+05:30`).toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata", weekday: "long",
  }).toLowerCase();
}

// ---------------------------------------------------------------------------
// The tip — one, from her own calls, stored as the day's coach tip
// ---------------------------------------------------------------------------

const OBJECTION_WORDS: Record<string, string> = {
  price: "rate too high", loan: "loan or money", location: "location", size: "size or layout",
  timing: "not buying yet", family: "family has to decide", competitor: "looking at other projects",
  not_serious: "not serious", other: "something else",
};

const TIP_SYSTEM =
  "You coach ONE Indian real-estate telecaller. Write ONE tip she can use on her calls TOMORROW. " +
  'Reply ONLY as JSON {"tip": string}. ' +
  "The tip must come from HER: what her coach notes say she should do better, what she tends to miss " +
  "(watch_out), and what her buyers keep saying (objections). Pick the ONE thing that will bring the most " +
  "site visits. Say what to do and give ONE short line she can say, in quotes. " +
  "If a company fact answers the objection, use that fact exactly as written. " +
  "Max 40 words. Simple everyday English a telecaller already knows. No Hindi. No words like rapport, " +
  "pain point, leverage, objection handling. Never invent prices, offers, project names, dates or numbers — " +
  "use only what you are given.";

type Persona = { summary?: string; how_she_sells?: string; strengths?: string[]; watch_out?: string[] };

/**
 * The day's tip for this rep, for `forDate` (IST).
 *
 * coach_briefs slot 'tip' is what the app's AI Coach shows that day (rep-coach
 * reads it before it ever writes one). So if the app already has a tip for the
 * day, the WhatsApp repeats it; if not, this writes it there, and tomorrow the
 * app shows the same words. One tip a day, everywhere.
 */
export async function planTip(
  admin: SupabaseClient,
  rep: { id: string; company_id: string; full_name: string | null },
  forDate: string,
): Promise<string | null> {
  const { data: kept } = await admin.from("coach_briefs").select("content")
    .eq("salesperson_id", rep.id).eq("brief_date", forDate).eq("slot", "tip").maybeSingle();
  if (typeof kept?.content === "string" && kept.content.trim()) return kept.content.trim();

  const since = new Date(Date.now() - 10 * 86400_000).toISOString();
  const [{ data: persona }, { data: calls }, { data: memory }] = await Promise.all([
    admin.from("rep_personas").select("persona").eq("salesperson_id", rep.id).maybeSingle(),
    admin.from("call_logs")
      .select("started_at, coach_feedback(rating, good, improve)")
      .eq("salesperson_id", rep.id).gte("started_at", since).gte("duration_seconds", 45)
      .order("started_at", { ascending: false }).limit(60),
    admin.from("lead_memory").select("objection_code, objection")
      .eq("salesperson_id", rep.id).not("objection_code", "is", null).limit(400),
  ]);

  const p = (persona?.persona ?? null) as Persona | null;
  type Fb = { rating: number | null; good: string | null; improve: string | null };
  const notes = ((calls ?? []) as { coach_feedback: Fb | Fb[] | null }[])
    .map((c) => (Array.isArray(c.coach_feedback) ? c.coach_feedback[0] : c.coach_feedback))
    .filter((f): f is Fb => !!f && !!(f.improve || f.good));
  const improve = [...new Set(notes.map((f) => clip(f.improve, 140)).filter(Boolean))].slice(0, 6);
  const good = [...new Set(notes.map((f) => clip(f.good, 120)).filter(Boolean))].slice(0, 3);

  const counts = new Map<string, { n: number; example: string }>();
  for (const m of (memory ?? []) as { objection_code: string; objection: string | null }[]) {
    const e = counts.get(m.objection_code) ?? { n: 0, example: clip(m.objection, 120) };
    e.n++;
    counts.set(m.objection_code, e);
  }
  const objections = [...counts.entries()].filter(([code]) => code !== "other" && code !== "not_serious")
    .sort((a, b) => b[1].n - a[1].n).slice(0, 2)
    .map(([code, e]) => `${OBJECTION_WORDS[code] ?? code} — ${e.n} buyers${e.example ? `, e.g. "${e.example}"` : ""}`);

  // Nothing of hers to go on — a generic tip is the filler this replaces.
  if (!improve.length && !p?.watch_out?.length && !objections.length) return null;

  const facts = await playbookFacts(admin, rep.company_id,
    `${objections.join(" ")} site visit booking offer price payment plan`);

  const user = [
    `Telecaller: ${rep.full_name ?? "telecaller"}`,
    p?.summary ? `Who she is on calls: ${p.summary}` : "",
    p?.how_she_sells ? `How she sells: ${p.how_she_sells}` : "",
    p?.watch_out?.length ? `watch_out:\n${p.watch_out.map((w) => `- ${w}`).join("\n")}` : "",
    improve.length ? `Her coach notes, do better (last 10 days):\n${improve.map((w) => `- ${w}`).join("\n")}` : "",
    good.length ? `What already works for her:\n${good.map((w) => `- ${w}`).join("\n")}` : "",
    objections.length ? `What her buyers keep saying:\n${objections.map((w) => `- ${w}`).join("\n")}` : "",
    facts.length ? `Company facts (use exactly, or not at all):\n${facts.map((f) => `- ${f}`).join("\n")}` : "",
  ].filter(Boolean).join("\n\n");

  const out = await askJson<{ tip?: string }>(TIP_SYSTEM, user, 0.4);
  const tip = clip(out.data?.tip, 320);
  if (!tip) return null;

  // A price, a percent or a plot size she would say out loud to a buyer must
  // be one we gave the model. Small numbers ("2 options", "11 AM") are words.
  const given = user.replace(/[,\s]/g, "");
  for (const n of tip.match(/\d[\d,.]*/g) ?? []) {
    const bare = n.replace(/[,\s]/g, "").replace(/\.$/, "");
    if (Number(bare) <= 12) continue;
    if (!given.includes(bare)) return null;
  }

  await admin.from("coach_briefs").upsert({
    salesperson_id: rep.id, brief_date: forDate, slot: "tip", company_id: rep.company_id, content: tip,
  }, { onConflict: "salesperson_id,brief_date,slot" });
  return tip;
}

async function playbookFacts(admin: SupabaseClient, companyId: string, query: string): Promise<string[]> {
  try {
    // deno-lint-ignore no-explicit-any
    const session = new (globalThis as any).Supabase.ai.Session("gte-small");
    const embedding = await session.run(query.slice(0, 1200), { mean_pool: true, normalize: true });
    const { data } = await admin.rpc("match_knowledge", {
      p_company: companyId, p_embedding: embedding, p_match_count: 4, p_min_similarity: 0.25,
    });
    return ((data ?? []) as Array<{ content: string }>).map((k) => clip(k.content, 450));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// The message
// ---------------------------------------------------------------------------

export type PlanTextInput = {
  name: string;
  companyName: string | null;
  /** IST date the plan is for. */
  planDate: string;
  forTomorrow: boolean;
  /** The day the numbers line is about, or null to leave it out. */
  day: RepPulse | null;
  dayLabel: string;
  plan: RepPlan;
  tip: string | null;
  /** "down": she linked WhatsApp and the link is not answering. */
  waLink: "ok" | "down" | "none";
};

/** How many people a section lists before it points at the app. */
const SHOW = { waiting: 5, visits: 6, promises: 8, callNow: 3 };

function more(left: number, section: string): string[] {
  return left > 0 ? [`+${left} more in the app: Home → Today's Plan → ${section}`] : [];
}

export function repPlanText(o: PlanTextInput): string {
  const { plan } = o;
  const c = plan.counts;
  const first = prettyName(o.name.split(" ")[0] ?? o.name, null);
  const L: string[] = [
    `📋 ${first} — your plan for ${o.forTomorrow ? "tomorrow" : "today"}, ${prettyDay(o.planDate)}`,
  ];
  if (o.companyName) L.push(o.companyName.trim());

  // What happened, in one line. The work is below it.
  const d = o.day;
  if (d) {
    if (!d.callsTrusted) {
      L.push("", `${o.dayLabel}: your phone did not send its call log, so your calls are not counted. Open the app once.`);
    } else {
      const bits = [`${d.calls} call${d.calls === 1 ? "" : "s"}`, `${d.connected} talked`];
      if (d.talkSeconds > 0) bits.push(`${fmtDur(d.talkSeconds).replace(/m$/, " min")} talk`);
      bits.push(`${d.visitsFixed} site visit${d.visitsFixed === 1 ? "" : "s"} fixed`);
      if (d.bookings > 0) bits.push(`${d.bookings} booking${d.bookings === 1 ? "" : "s"} 🎉`);
      L.push("", `${o.dayLabel}: ${bits.join(" · ")}`);
    }
  }

  if (o.waLink === "down") {
    L.push("", "⚠️ Your WhatsApp is not linked to the app right now. Open the app → WhatsApp → link it again, so your chats are counted.");
  }

  const shown = new Set<string>();

  // 1. A buyer wrote and nobody answered — they acted first, so they come first.
  if (plan.waiting.length) {
    L.push("", `💬 ${PLAN_SECTIONS.waiting} (${c.waiting})`);
    for (const w of plan.waiting.slice(0, SHOW.waiting)) {
      shown.add(w.contact_id);
      const said = w.text ? ` · "${clip(w.text, 50)}"` : w.media ? ` · sent a ${w.media}` : "";
      L.push(`• ${prettyName(w.name, w.phone)} · ${phoneLabel(w.phone)} · ${waited(w.minutes)}${said}`);
    }
    L.push(...more(c.waiting - SHOW.waiting, PLAN_SECTIONS.waiting));
  }

  // 2. Site visits — the rest of today and tomorrow. A call the morning of a
  //    visit is the difference between a visit and a no-show.
  if (plan.visits.length) {
    L.push("", `🏠 ${PLAN_SECTIONS.visits} — call to confirm (${c.visits})`);
    for (const v of plan.visits.slice(0, SHOW.visits)) {
      shown.add(v.contact_id);
      const vDay = istDateOf(v.at);
      const when = vDay === o.planDate ? timeOf(v.at) : `${weekdayOf(vDay)} ${timeOf(v.at)}`;
      L.push(`• ${prettyName(v.name, v.phone)} · ${phoneLabel(v.phone)} · ${when}${v.project ? ` · ${clip(v.project, 30)}` : ""}`);
    }
    L.push(...more(c.visits - SHOW.visits, PLAN_SECTIONS.visits));
  }

  // 3. What she said on a call she would do. Grouped by what she has to DO.
  if (plan.promises.length) {
    L.push("", `🤝 ${PLAN_SECTIONS.promises} (${c.promise_people} ${c.promise_people === 1 ? "person" : "people"})`);
    const picked = plan.promises.slice(0, SHOW.promises);
    // The group of the person who leads the plan goes first: on a Saturday
    // night that is "Fix the visit day", because the Sunday ones lead.
    const kindOf = (p: RepPlan["promises"][number]) =>
      (p.items.find((i) => plan.plan_day && i.promise.toLowerCase().includes(weekdayLong(plan.plan_day))) ??
        p.items.find((i) => i.late) ?? p.items[0])?.kind ?? "other";
    const kinds = [...new Set(picked.map(kindOf))];
    for (const k of kinds) {
      const rows = picked.filter((p) => kindOf(p) === k);
      if (!rows.length) continue;
      L.push(KIND_HEAD[k] ?? "Do what you said:");
      for (const p of rows) {
        shown.add(p.contact_id);
        const what = [...new Set(p.items.map((i) => clip(i.promise, 40)))].join(" + ");
        const late = age(p.oldest_days);
        L.push(`• ${prettyName(p.name, p.phone)} · ${phoneLabel(p.phone)} · ${what}${late ? ` · ${late}` : ""}`);
      }
    }
    L.push(...more(c.promise_people - picked.length, PLAN_SECTIONS.promises));
  }

  // 4. Already written for her.
  if (plan.drafts.length) {
    const names = plan.drafts.slice(0, 3).map((x) => prettyName(x.name, x.phone)).join(", ");
    const extra = c.drafts > 3 ? ` and ${c.drafts - 3} more` : "";
    L.push("", `✍️ ${c.drafts} WhatsApp${c.drafts === 1 ? " is" : "s are"} already written for you: ${names}${extra}.`,
      `Open the app → ${PLAN_SECTIONS.drafts} → check → Approve & send.`);
  }

  // 5. Then Call now, in the app's own order, minus anyone already named.
  if (c.call_now > 0) {
    const next = plan.call_now.filter((r) => !shown.has(r.contact_id)).slice(0, SHOW.callNow);
    L.push("", `📞 ${PLAN_SECTIONS.callNow}: ${c.call_now} ${c.call_now === 1 ? "person" : "people"}.` +
      (next.length ? " After the ones above, start with:" : ""));
    for (const r of next) {
      L.push(`• ${prettyName(r.name, r.phone)} · ${phoneLabel(r.phone)} · ${callReason(r)}`);
    }
    if (c.call_now > next.length) L.push("The app keeps everyone else in the same order.");
  }

  // 6. A visit day went by and nobody wrote what happened.
  if (c.visits_pending > 0) {
    L.push("", `📍 ${c.visits_pending} site visit${c.visits_pending === 1 ? " has" : "s have"} no outcome yet. ` +
      `In the app (${PLAN_SECTIONS.pending}), tap "Yes, they came" or "Didn't come".`);
  }

  if (o.tip) L.push("", `💡 Tip for ${o.forTomorrow ? "tomorrow" : "today"}`, o.tip);

  const nothing = !plan.waiting.length && !plan.visits.length && !plan.promises.length &&
    !plan.drafts.length && !c.call_now && !c.visits_pending;
  L.push("", nothing ? "Nothing is waiting on you. Add new leads or open Leads → All." :
    "All of this is in your app: Home → Today's Plan.");
  L.push("", PULSE_FOOTER);
  return L.join("\n");
}
