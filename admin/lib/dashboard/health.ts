/**
 * One vocabulary for "how bad is this".
 *
 * Four modules had invented their own, and none of them agreed:
 *
 *   actions/page.tsx      severity(days)  → 🔴 🟠 🟡 🔵 🟢  with five hex colours
 *   rag/page.tsx          health(stat)    → Empty / Getting started / Healthy
 *   automations/Health    Verdict.level   → ok | warn | bad | unknown
 *   health/SyncHeartbeat  STATE map       → 🟢 🔴 🟠 ⚪ with its own labels
 *
 * The same amber meant "getting started" on one page and "about to fail" on
 * another, and #f59e0b on one screen sat next to #fb923c on the next for the
 * same meaning. A manager scanning four tabs cannot learn a colour code that
 * changes per tab, so they stop reading colour at all — which is the entire
 * point of having it.
 *
 * So the scale lives here, and the modules map their own domain question onto
 * it. What each level MEANS is fixed; what triggers it stays local, because
 * "21 days without a site-visit outcome" and "no completed phone sync for 3
 * hours" are genuinely different questions with the same answer: act now.
 */

/** Ordered worst-last, so `worstOf` is a max and not a lookup table. */
export const LEVELS = ["ok", "info", "watch", "warn", "bad", "unknown"] as const;
export type Level = (typeof LEVELS)[number];

type LevelStyle = { dot: string; color: string; rank: number };

/**
 * `unknown` is deliberately its own state and NOT a shade of bad.
 *
 * "We have not heard from this phone" and "this phone is broken" are different
 * facts, and collapsing them is how a rep with no app installed looked exactly
 * like a rep whose sync had died. Grey says *we do not know*, and that is
 * information a manager can act on.
 */
const STYLE: Record<Level, LevelStyle> = {
  ok:      { dot: "🟢", color: "#4ade80", rank: 0 },
  info:    { dot: "🔵", color: "#60a5fa", rank: 1 },
  watch:   { dot: "🟡", color: "#facc15", rank: 2 },
  warn:    { dot: "🟠", color: "#fb923c", rank: 3 },
  bad:     { dot: "🔴", color: "#f87171", rank: 4 },
  unknown: { dot: "⚪", color: "#94a3b8", rank: 1 },
};

export const dotOf = (l: Level): string => STYLE[l].dot;
export const colorOf = (l: Level): string => STYLE[l].color;

/** The worst level in a set — what a section header should show. */
export function worstOf(levels: Level[]): Level {
  return levels.reduce<Level>(
    (worst, l) => (STYLE[l].rank > STYLE[worst].rank ? l : worst),
    "ok",
  );
}

/**
 * How bad is something that has been waiting this many days?
 *
 * The thresholds are the Action Center's, kept exactly: a site visit with no
 * outcome after three weeks is a different problem from one from this morning,
 * and the eye should land on the worst row without reading a number.
 */
export function agedLevel(days: number | null): Level {
  if (days === null) return "unknown";
  if (days >= 21) return "bad";
  if (days >= 14) return "warn";
  if (days >= 7) return "watch";
  if (days >= 1) return "info";
  return "ok";
}

/**
 * How bad is a heartbeat that last succeeded at `iso`?
 *
 * Null is `unknown`, never `bad` — see the note on the STYLE table. A thing
 * that has never reported has not failed; nobody has asked it yet.
 */
export function freshnessLevel(
  iso: string | null | undefined,
  staleAfterMinutes: number,
): Level {
  if (!iso) return "unknown";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "unknown";
  const mins = (Date.now() - t) / 60_000;
  if (mins > staleAfterMinutes * 3) return "bad";
  if (mins > staleAfterMinutes) return "warn";
  return "ok";
}

/**
 * How bad is a ratio that is supposed to be high?
 *
 * `floorForUnknown` guards the small-sample trap: two calls, one connected, is
 * not a 50% connect rate worth colouring red. Below that many observations the
 * honest answer is that we do not know yet.
 */
export function ratioLevel(
  part: number,
  whole: number,
  { good, poor, floorForUnknown = 3 }: { good: number; poor: number; floorForUnknown?: number },
): Level {
  if (whole < floorForUnknown) return "unknown";
  const r = part / whole;
  if (r >= good) return "ok";
  if (r <= poor) return "bad";
  return "warn";
}

/**
 * How bad is a queue with this many things in it and this oldest item?
 *
 * Depth alone is not the signal — five messages held for two minutes is the
 * outbox working, and one held for an hour is the outbox losing.
 */
export function backlogLevel(count: number, oldestMinutes: number | null): Level {
  if (count === 0) return "ok";
  if (oldestMinutes !== null && oldestMinutes > 30) return "bad";
  return "warn";
}
