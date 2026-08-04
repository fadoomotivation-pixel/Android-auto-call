/**
 * What the KPIs on this dashboard actually mean.
 *
 * A metric computed in three places is three metrics. The connect rate was
 * being worked out inline on the Overview leaderboard, again in the Report
 * Builder, and again inside the Pulse — each with its own rounding and its own
 * answer to "what if they made zero calls". Divide-by-zero was handled three
 * different ways: 0, "0%", and NaN rendered as "NaN%".
 *
 * These are one-line functions and that is the point. They are here not because
 * they are hard, but because a definition with one home cannot disagree with
 * itself — and when the definition changes (a "connected" call becoming one
 * with talk time rather than one that merely rang), it changes for the whole
 * product in one edit.
 *
 * Everything returns a NUMBER. Formatting belongs to ./format.ts, so a metric
 * can be compared, sorted and thresholded without being parsed back out of a
 * string with a percent sign on the end.
 */

import { pct } from "./format";

/* ─────────────────────────── call quality ─────────────────────────── */

/** Share of dialled calls that actually connected, 0-100. */
export function connectRate(connected: number, calls: number): number {
  return pct(connected, calls);
}

/** Average talk time per CONNECTED call, in seconds. Zero when none connected. */
export function talkPerConnect(talkSeconds: number, connected: number): number {
  return connected > 0 ? Math.round(talkSeconds / connected) : 0;
}

/**
 * Share of people actually spoken to who agreed to a site visit, 0-100.
 *
 * Deliberately over CONNECTED, not over dialled. Measuring visits against every
 * number dialled buries the only thing the rep controls — what happens once
 * somebody picks up — under how many wrong numbers the list contained.
 */
export function visitRate(visitsFixed: number, connected: number): number {
  return pct(visitsFixed, connected);
}

/* ───────────────────────── speed to lead ──────────────────────────── */

/**
 * Speed-to-lead, bucketed the way the business talks about it.
 *
 * Five minutes is not arbitrary: it is the threshold the Velocity page already
 * measures against and the one the SLA cron guards. Naming the buckets stops
 * three pages inventing three different definitions of "fast".
 */
export type SpeedBand = "instant" | "fast" | "slow" | "cold" | "never";

export function speedBand(minutesToFirstCall: number | null): SpeedBand {
  if (minutesToFirstCall === null) return "never";
  if (minutesToFirstCall <= 5) return "instant";
  if (minutesToFirstCall <= 60) return "fast";
  if (minutesToFirstCall <= 24 * 60) return "slow";
  return "cold";
}

export const SPEED_LABEL: Record<SpeedBand, string> = {
  instant: "Under 5 minutes",
  fast: "Within the hour",
  slow: "Same day",
  cold: "Over a day",
  never: "Never called",
};

/* ───────────────────────── follow-up discipline ───────────────────── */

/**
 * Share of today's due follow-ups that were kept, 0-100.
 *
 * Capped at 100 because clearing yesterday's backlog counts, and a rep who
 * completed twelve of nine due today should read as 100%, not 133%.
 *
 * The BACKLOG IS NOT IN THIS NUMBER, on purpose. Scoring the whole open backlog
 * gave a rep with fifty historic overdue callbacks 1/100 on a day she worked,
 * because clearing three still leaves forty-seven missed. A score nobody can
 * move is a score nobody reads. The same rule is enforced server-side in
 * rep_day_facts(); this is its client-side twin and the two must agree.
 */
export function followUpRate(completed: number, scheduled: number): number {
  if (scheduled <= 0) return 0;
  return Math.min(100, pct(completed, scheduled));
}

/* ──────────────────────────── revenue ─────────────────────────────── */

/**
 * Money per connected conversation, in rupees.
 *
 * The honest denominator is conversations, not leads: a rep handed 500 dead
 * numbers and one buyer has not earned a worse number than a rep handed five
 * good ones.
 */
export function revenuePerConversation(revenue: number, connected: number): number {
  return connected > 0 ? Math.round(revenue / connected) : 0;
}
