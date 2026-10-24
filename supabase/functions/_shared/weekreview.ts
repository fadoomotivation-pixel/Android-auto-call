// The Monday report card: a telecaller's week, and what their own calls say.
//
// Two halves, built two different ways on purpose.
//
//   THE NUMBERS come from rep_week_summary() — the same daily facts the nightly
//   review prints, added up — so the week never disagrees with the days.
//
//   THE FEEDBACK comes from the rep's recorded calls. Every recorded call
//   already has an English summary, the buyer's objections and, for some, a
//   coach rating. The PATTERNS are counted here, in code: "16 of 18 interested
//   buyers ended with no day fixed" is arithmetic, and an AI asked to count
//   gets it wrong. The AI is asked only for what needs judgement — two things
//   done well and two to do better, each tied to a real call by the buyer's
//   name and the day — in ONE call per rep per week.
//
// Every point must name a call from the list it was given. A point that names
// a call we did not send is dropped, so the rep is never told about a buyer
// they never spoke to.
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { askJson } from "./chat.ts";
import { PULSE_FOOTER } from "./pulse.ts";

export type WeekRep = {
  salesperson_id: string;
  company_id: string;
  full_name: string | null;
  company_name?: string | null;
};

type Week = {
  from: string; to: string;
  calls: number; connected: number; talk_seconds: number;
  followups_scheduled: number; followups_completed: number;
  site_visits: number; bookings: number;
};

type Point = { text: string; say?: string; call: string };
export type Coaching = {
  did_well: (Point & { who: string; when: string })[];
  fix: (Point & { who: string; when: string })[];
  focus: string | null;
  best_call: { who: string; when: string; minutes: number } | null;
};

export type BuiltReview = {
  text: string | null;
  recorded: number;
  coaching: Coaching | null;
  /** Why there is no feedback when there were enough calls for some. */
  error: string | null;
  model: string | null;
  weekFrom: string;
  weekTo: string;
};

/** A call shorter than this is a wrong number or a ring-out, not a conversation. */
const MIN_SECONDS = 30;
/** Below this, "what you did well" would be built from one or two calls — not fair. */
const MIN_FOR_FEEDBACK = 3;
/** About 10k characters of call notes: one short prompt. */
const MAX_EVIDENCE = 30;

const IST_MS = 5.5 * 3600 * 1000;

/** The last day of the week a review is about: yesterday, in India. */
export function defaultWeekTo(): string {
  return new Date(Date.now() + IST_MS - 86400_000).toISOString().slice(0, 10);
}

function addDays(date: string, n: number): string {
  return new Date(new Date(`${date}T00:00:00Z`).getTime() + n * 86400_000).toISOString().slice(0, 10);
}

function istStart(date: string): string {
  return new Date(`${date}T00:00:00+05:30`).toISOString();
}

function dayTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata", weekday: "short", hour: "numeric", minute: "2-digit", hour12: true,
  }).replace(",", "").replace(/\b(am|pm)\b/, (m) => m.toUpperCase());
}

function dayOnly(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short" });
}

function dayDate(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short",
  }).replace(",", "");
}

function talk(seconds: number): string {
  const m = Math.round(seconds / 60);
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
}

/** "Rakesh (Tue)", or "Tue 4:12 PM call" when the buyer has no name in the CRM. */
const label = (p: { who: string; when: string }) => p.who ? `${p.who} (${p.when})` : `${p.when} call`;

function firstName(full: string | null): string {
  const f = (full ?? "").trim().split(/\s+/)[0] ?? "";
  return f ? f[0].toUpperCase() + f.slice(1) : "there";
}

function clip(s: unknown, n: number): string {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

async function summary(admin: SupabaseClient, rep: string, to: string, days = 7): Promise<Week | null> {
  const { data } = await admin.rpc("rep_week_summary", { p_salesperson: rep, p_to: to, p_days: days });
  if (!data) return null;
  const w = data as Record<string, unknown>;
  const n = (k: string) => Number(w[k] ?? 0) || 0;
  return {
    from: String(w.from ?? ""), to: String(w.to ?? ""),
    calls: n("calls"), connected: n("connected"), talk_seconds: n("talk_seconds"),
    followups_scheduled: n("followups_scheduled"), followups_completed: n("followups_completed"),
    site_visits: n("site_visits"), bookings: n("bookings"),
  };
}

type CallRow = {
  id: string;
  started_at: string;
  duration_seconds: number;
  summary: string | null;
  suggested_disposition: string | null;
  ai_actions: Record<string, unknown> | null;
  contacts: { name: string | null } | { name: string | null }[] | null;
  coach_feedback: { rating: number | null; good: string | null; improve: string | null }
    | { rating: number | null; good: string | null; improve: string | null }[] | null;
};

const one = <T,>(v: T | T[] | null): T | null => Array.isArray(v) ? (v[0] ?? null) : v;

/** The company's own playbook on what this rep's buyers kept saying — so a
 *  "say this instead" quotes the real offer, not a made-up one. */
async function playbook(admin: SupabaseClient, companyId: string, query: string): Promise<string[]> {
  if (!query.trim()) return [];
  try {
    // deno-lint-ignore no-explicit-any
    const session = new (globalThis as any).Supabase.ai.Session("gte-small");
    const embedding = await session.run(query.slice(0, 1200), { mean_pool: true, normalize: true });
    const { data } = await admin.rpc("match_knowledge", {
      p_company: companyId, p_embedding: embedding, p_match_count: 4, p_min_similarity: 0.25,
    });
    return ((data ?? []) as Array<{ content: string }>).map((k) => clip(k.content, 500));
  } catch {
    // Feedback without the playbook is still feedback; it just cannot quote a price.
    return [];
  }
}

const SYSTEM =
  "You are a warm, honest senior real-estate sales coach. You write a telecaller's WEEKLY feedback from " +
  "short notes on their own recorded calls from the last 7 days. Each call has an id like C4. " +
  'Reply ONLY as JSON: {"did_well":[{"text":string,"call":"C#"}],"fix":[{"text":string,"say":string,"call":"C#"}],' +
  '"focus":string,"best_call":"C#"}. ' +
  "did_well: exactly 2 things this telecaller really did well, each from a DIFFERENT call. Say what they did, " +
  "max 22 words each. " +
  "fix: exactly 2 things to do better. Prefer the counted patterns you are given. Each is tied to one call where " +
  "it happened. text = what happened on that call, max 22 words, no blame words (failed, bad, poor, weak, lazy). " +
  "say = ONE short line the telecaller can say next time on a call like that, max 18 words. Use a price, offer " +
  "or project name ONLY if it is in the playbook facts. " +
  "focus = ONE goal for next week that they can count, max 14 words. " +
  "best_call = the id of the best call to listen to again. " +
  "Write simple everyday English a telecaller already knows: short words, short sentences. No Hindi. No words " +
  "like rapport, pain point, objection handling, leverage. Do not start a point with the buyer's name. " +
  "Use ONLY what is in the notes. Never invent buyers, numbers, prices or events. Use only ids from the list.";

/** The stored card for this week, if one was built. */
export async function storedWeekReview(
  admin: SupabaseClient, repId: string, weekTo: string,
): Promise<{ text: string; recorded_calls: number; built_at: string; sent_at: string | null } | null> {
  const { data } = await admin.from("rep_week_reviews")
    .select("text, recorded_calls, built_at, sent_at")
    .eq("salesperson_id", repId).eq("week_to", weekTo).maybeSingle();
  return (data as never) ?? null;
}

export async function markWeekReviewSent(admin: SupabaseClient, repId: string, weekTo: string) {
  await admin.from("rep_week_reviews").update({ sent_at: new Date().toISOString() })
    .eq("salesperson_id", repId).eq("week_to", weekTo);
}

/**
 * Build one telecaller's card.
 *
 * @param coach  false = numbers only, no AI (the 10 AM fallback for a card the
 *               early-morning build did not reach).
 * @param store  write it to rep_week_reviews. Only a finished card is stored —
 *               one whose AI call failed is not, so the next run tries again.
 */
export async function buildWeekReview(
  admin: SupabaseClient,
  rep: WeekRep,
  opts: { coach: boolean; store: boolean; weekTo?: string },
): Promise<BuiltReview> {
  const weekTo = opts.weekTo ?? defaultWeekTo();
  const weekFrom = addDays(weekTo, -6);
  const empty = { text: null, recorded: 0, coaching: null, error: null, model: null, weekFrom, weekTo };

  const dayOfMonth = Number(weekTo.slice(8, 10));
  const [week, prev, month, device, callsRes] = await Promise.all([
    summary(admin, rep.salesperson_id, weekTo),
    summary(admin, rep.salesperson_id, addDays(weekTo, -7)),
    // "So far this month" only says something new once the month is longer than the week.
    dayOfMonth > 7 ? summary(admin, rep.salesperson_id, weekTo, dayOfMonth) : Promise.resolve(null),
    admin.from("v_device_sync_health").select("last_ok_at").eq("salesperson_id", rep.salesperson_id).maybeSingle(),
    admin.from("call_logs")
      .select("id, started_at, duration_seconds, summary, suggested_disposition, ai_actions, contacts(name), " +
              "coach_feedback(rating, good, improve)")
      .eq("salesperson_id", rep.salesperson_id)
      .gte("started_at", istStart(weekFrom)).lt("started_at", istStart(addDays(weekTo, 1)))
      .gte("duration_seconds", MIN_SECONDS)
      .not("summary", "is", null)
      .order("duration_seconds", { ascending: false })
      .limit(400),
  ]);
  if (!week) return { ...empty, error: "Could not read this week's numbers." };

  const calls = ((callsRes.data ?? []) as unknown as CallRow[]).filter((c) => String(c.summary ?? "").trim().length > 20);
  const recorded = calls.length;

  // A week with nothing in it is not a review, it is a reminder that the rep
  // was away. Say nothing rather than send a page of zeroes.
  if (week.calls === 0 && week.followups_completed === 0 && recorded === 0) return empty;

  // ---- what the calls say, counted ----
  const interested = calls.filter((c) => c.suggested_disposition === "interested");
  const noNextDay = interested.filter((c) => !c.ai_actions?.promise_at);
  const visitsOnCalls = calls.filter((c) => c.suggested_disposition === "site_visit").length;
  const objectionCount = new Map<string, number>();
  for (const c of calls) {
    const list = Array.isArray(c.ai_actions?.objections) ? c.ai_actions!.objections as unknown[] : [];
    for (const o of list) {
      const k = clip(o, 60).toLowerCase();
      if (k) objectionCount.set(k, (objectionCount.get(k) ?? 0) + 1);
    }
  }
  const topObjections = [...objectionCount.entries()].filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1]).slice(0, 3);
  const patternLine = interested.length >= 3 && noNextDay.length * 2 >= interested.length
    ? `${noNextDay.length} of ${interested.length} interested buyers ended with no day fixed for the next step.`
    : null;

  // ---- the feedback ----
  let coaching: Coaching | null = null;
  let error: string | null = null;
  let model: string | null = null;
  if (opts.coach && recorded >= MIN_FOR_FEEDBACK) {
    // The calls worth reading: the ones that went somewhere, the ones the coach
    // already rated, then the longest. In time order, so C1 is Monday.
    const picked = new Map<string, CallRow>();
    const take = (rows: CallRow[], cap: number) => {
      for (const r of rows) { if (picked.size >= cap) break; picked.set(r.id, r); }
    };
    take(calls.filter((c) => ["interested", "site_visit", "callback"].includes(c.suggested_disposition ?? "")), 14);
    take(calls.filter((c) => one(c.coach_feedback)), 22);
    take(calls, MAX_EVIDENCE);
    const evidence = [...picked.values()].sort((a, b) => a.started_at.localeCompare(b.started_at));
    const byRef = new Map<string, CallRow>();
    const lines = evidence.map((c, i) => {
      const ref = `C${i + 1}`;
      byRef.set(ref, c);
      const fb = one(c.coach_feedback);
      const obj = Array.isArray(c.ai_actions?.objections) ? (c.ai_actions!.objections as unknown[]).map((o) => clip(o, 40)).join(", ") : "";
      return [
        ref, dayTime(c.started_at), clip(one(c.contacts)?.name || "buyer", 30),
        `${Math.max(1, Math.round(c.duration_seconds / 60))} min`,
        c.suggested_disposition ? `result: ${c.suggested_disposition}` : "",
        fb?.rating ? `coach rating ${fb.rating}/5` : "",
        clip(c.summary, 260),
        obj ? `buyer said: ${obj}` : "",
        c.suggested_disposition === "interested" ? `next step day fixed: ${c.ai_actions?.promise_at ? "yes" : "no"}` : "",
        fb?.good ? `coach liked: ${clip(fb.good, 140)}` : "",
        fb?.improve ? `coach said improve: ${clip(fb.improve, 140)}` : "",
      ].filter(Boolean).join(" · ");
    });

    const facts = await playbook(admin, rep.company_id,
      topObjections.map(([o]) => o).join(", ") || "how to fix a site visit with an interested buyer");
    const patterns = [
      `Recorded calls this week: ${recorded}.`,
      patternLine ?? (interested.length ? `${interested.length} buyers were interested; ${noNextDay.length} of them had no next-step day fixed.` : ""),
      visitsOnCalls ? `${visitsOnCalls} calls ended with a site visit fixed.` : "",
      topObjections.length ? `What buyers said most: ${topObjections.map(([o, n]) => `${o} (${n})`).join("; ")}.` : "",
    ].filter(Boolean).join("\n");

    const out = await askJson<{
      did_well?: { text?: string; call?: string }[];
      fix?: { text?: string; say?: string; call?: string }[];
      focus?: string; best_call?: string;
    }>(SYSTEM,
      `Telecaller: ${firstName(rep.full_name)}\n\nCounted patterns (true):\n${patterns}\n\n` +
      (facts.length ? `Company playbook facts:\n${facts.map((f) => `- ${f}`).join("\n")}\n\n` : "") +
      `Calls:\n${lines.join("\n")}`,
      0.3);
    model = out.model;

    if (out.data) {
      // A buyer with no name in the CRM is named by the time of the call, which
      // is how the rep would find it again anyway.
      const who = (ref: string) => {
        const c = byRef.get(ref)!;
        const name = clip(one(c.contacts)?.name ?? "", 24);
        return name ? { who: name, when: dayOnly(c.started_at) } : { who: "", when: dayTime(c.started_at) };
      };
      const valid = (p: { text?: string; call?: string } | undefined) =>
        !!p && typeof p.text === "string" && p.text.trim().length > 5 && byRef.has(String(p.call ?? "").trim());
      const did = (out.data.did_well ?? []).filter(valid).slice(0, 2)
        .map((p) => ({ text: clip(p.text, 180), call: String(p.call).trim(), ...who(String(p.call).trim()) }));
      const fix = (out.data.fix ?? []).filter(valid).slice(0, 2)
        .map((p) => ({
          text: clip(p.text, 180),
          say: typeof p.say === "string" && p.say.trim() ? clip(p.say, 140).replace(/^["“]|["”]$/g, "") : undefined,
          call: String(p.call).trim(),
          ...who(String(p.call).trim()),
        }));
      const bestRef = String(out.data.best_call ?? "").trim();
      // A one-minute call is not the one to learn from, whatever the AI thought.
      const best = (byRef.get(bestRef)?.duration_seconds ?? 0) >= 120 ? byRef.get(bestRef) : undefined;
      if (did.length || fix.length) {
        coaching = {
          did_well: did,
          fix,
          focus: typeof out.data.focus === "string" && out.data.focus.trim() ? clip(out.data.focus, 120) : null,
          best_call: best
            ? { ...who(bestRef), when: dayTime(best.started_at), minutes: Math.max(1, Math.round(best.duration_seconds / 60)) }
            : null,
        };
      } else {
        error = "The coach's answer named no real call, so it was left out.";
      }
    } else {
      error = out.error ?? "The coach did not answer.";
    }
  }

  // ---- the message ----
  const lastOk = (device.data as { last_ok_at?: string | null } | null)?.last_ok_at ?? null;
  // The phone has to have reported near the end of the week for the counts to
  // be the whole week. Two days of slack: Sunday is often a day off.
  const countsComplete = !!lastOk && lastOk >= istStart(addDays(weekTo, -2));

  const L: string[] = [
    `📋 Your week · ${week.from} – ${week.to}`,
    `Hi ${firstName(rep.full_name)} 👋${rep.company_name ? ` · ${rep.company_name.trim()}` : ""}`,
    "",
    `📞 Calls: ${week.calls}${prev && prev.calls ? ` (last week ${prev.calls})` : ""}`,
    `🗣️ Picked up: ${week.connected} · Talk time ${talk(week.talk_seconds)}`,
    `🔁 Follow-ups done: ${week.followups_completed} of ${week.followups_scheduled}`,
    `📍 Site visits fixed: ${week.site_visits}`,
    `🎉 Bookings: ${week.bookings}`,
  ];
  if (month && (month.site_visits > 0 || month.bookings > 0)) {
    L.push(`📆 This month so far: ${month.site_visits} site visit${month.site_visits === 1 ? "" : "s"} · ` +
      `${month.bookings} booking${month.bookings === 1 ? "" : "s"}`);
  }
  if (!countsComplete) {
    L.push("", lastOk
      ? `⚠️ Your phone last sent calls to the CRM on ${dayDate(lastOk)}. Some calls may be missing here. Open the Call Pro AI app.`
      : "⚠️ Your phone is not sending calls to the CRM, so these numbers may be low. Open the Call Pro AI app.");
  }

  if (coaching) {
    if (coaching.did_well.length) {
      L.push("", "✅ What you did well");
      for (const p of coaching.did_well) L.push(`• ${label(p)}: ${p.text}`);
    }
    if (coaching.fix.length) {
      L.push("", "🛠️ What to do better");
      for (const p of coaching.fix) {
        L.push(`• ${label(p)}: ${p.text}`);
        if (p.say) L.push(`  👉 Say: "${p.say}"`);
      }
    }
    if (patternLine) L.push("", `📌 ${patternLine}`);
    if (coaching.focus) L.push("", "🎯 Your one goal this week", coaching.focus);
    if (coaching.best_call) {
      const b = coaching.best_call;
      L.push("", `🎧 Listen again: ${b.who ? `${b.who}, ` : "your call on "}${b.when} (${b.minutes} min). Your best call this week.`);
    }
    L.push("", `Feedback from ${recorded} of your recorded calls.`);
  } else if (recorded === 0) {
    L.push("", "🎙️ None of your calls were recorded this week, so there is no call feedback. " +
      "Ask your manager to switch on call recording. Then every Monday you get feedback on your own calls.");
  } else if (recorded < MIN_FOR_FEEDBACK) {
    L.push("", `🎙️ Only ${recorded} of your calls were recorded this week. That is too few for fair feedback.`);
  } else if (patternLine) {
    // The AI is down or was not asked; the counted pattern is still true.
    L.push("", `📌 ${patternLine}`);
  }

  L.push("", PULSE_FOOTER);
  const text = L.join("\n");

  // Store only a finished card. One whose AI call failed is left for the next run.
  const finished = !opts.coach || recorded < MIN_FOR_FEEDBACK || coaching !== null;
  if (opts.store && opts.coach && finished) {
    await admin.from("rep_week_reviews").upsert({
      salesperson_id: rep.salesperson_id,
      company_id: rep.company_id,
      week_from: weekFrom,
      week_to: weekTo,
      recorded_calls: recorded,
      coaching,
      text,
      model,
      built_at: new Date().toISOString(),
    });
  }

  return { text, recorded, coaching, error, model, weekFrom, weekTo };
}
