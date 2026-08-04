/**
 * How this dashboard writes a date, a rupee and a duration.
 *
 * Thirty-one files defined their own IST formatter. They mostly agreed, which
 * is the dangerous part: "mostly" means one page says `4 Aug, 3:14 pm` and
 * another says `04/08/2026, 15:14`, and a manager comparing two screens has to
 * work out whether they are looking at the same moment. Worse, a file that
 * forgets `timeZone` renders UTC — and a Noida manager reading a UTC due-time
 * chases the wrong hour without ever seeing an error.
 *
 * So: one set of formatters, IST always, named for what they produce.
 *
 * ONE TRAP, and it has broken a Vercel build before. Intl.NumberFormat REJECTS
 * a `timeZone` option. Passing one to a NUMBER's toLocaleString throws at
 * runtime, which is why the money and count helpers below never take locale
 * options from the caller — the mistake is easy to make once and impossible to
 * make against this module.
 */

const IST = "Asia/Kolkata";

/* ────────────────────────────── time ────────────────────────────── */

/** "4 Aug, 3:14 PM" — the default for anything with a time that matters. */
export function ist(iso: string | null | undefined, fallback = "—"): string {
  if (!iso) return fallback;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return fallback;
  return d.toLocaleString("en-IN", {
    timeZone: IST, day: "numeric", month: "short",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
}

/** "3:14 PM" — when the day is already obvious from context. */
export function istClock(iso: string | null | undefined, fallback = ""): string {
  if (!iso) return fallback;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return fallback;
  return d.toLocaleString("en-IN", {
    timeZone: IST, hour: "numeric", minute: "2-digit", hour12: true,
  });
}

/** "4 Aug" — a date with no time. */
export function istDate(iso: string | null | undefined, fallback = "—"): string {
  if (!iso) return fallback;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return fallback;
  return d.toLocaleDateString("en-IN", { timeZone: IST, day: "numeric", month: "short" });
}

/** "Tue, 4 Aug" — the heading on a report. */
export function istDay(iso: string | null | undefined, fallback = "—"): string {
  if (!iso) return fallback;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return fallback;
  return d.toLocaleDateString("en-IN", {
    timeZone: IST, weekday: "short", day: "numeric", month: "short",
  });
}

/** "Tue, 4 Aug 2026" — a dated report heading, where the year matters. */
export function istDayYear(iso: string | null | undefined, fallback = "—"): string {
  if (!iso) return fallback;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return fallback;
  return d.toLocaleDateString("en-IN", {
    timeZone: IST, weekday: "short", day: "numeric", month: "short", year: "numeric",
  });
}

/** Today in IST as YYYY-MM-DD — the key every daily report is filed under. */
export function istToday(offsetDays = 0): string {
  return new Date(Date.now() + 5.5 * 3600_000 + offsetDays * 86_400_000)
    .toISOString().slice(0, 10);
}

/** Whole days since `iso`, or null. Negative means it is still in the future. */
export function daysAgo(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86_400_000);
}

/** "just now" · "12m ago" · "3h ago" · "2d ago". For freshness, not for records. */
export function ago(iso: string | null | undefined, fallback = "never"): string {
  if (!iso) return fallback;
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return fallback;
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/* ──────────────────────────── durations ─────────────────────────── */

/** Seconds → "45s" · "12m" · "2h 57m". Talk time, call length. */
export function duration(seconds: number | null | undefined): string {
  const s = Math.max(0, Math.round(seconds ?? 0));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

/** Minutes → "4m" · "2h 57m" · "1d 3h". Waiting times, which get long. */
export function minutes(min: number | null | undefined): string {
  if (!min || min <= 0) return "—";
  if (min < 60) return `${Math.round(min)}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ${Math.round(min % 60)}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

/* ───────────────────────────── numbers ──────────────────────────── */

/**
 * Indian money, the way it is said out loud: ₹50,000 · ₹2.5L · ₹1.2Cr.
 *
 * Lakh and crore rather than K/M, because the people reading this quote prices
 * in lakhs and would have to convert every figure otherwise.
 */
export function rupees(n: number | null | undefined): string {
  const v = Math.round(n ?? 0);
  if (v >= 10_000_000) return `₹${(v / 10_000_000).toFixed(v % 10_000_000 === 0 ? 0 : 2)}Cr`;
  if (v >= 100_000) return `₹${(v / 100_000).toFixed(v % 100_000 === 0 ? 0 : 2)}L`;
  return `₹${v.toLocaleString("en-IN")}`;
}

/** 1200 → "1.2k". For counts on a tile, never for money. */
export function compactNum(n: number | null | undefined): string {
  const v = n ?? 0;
  return v >= 1000 ? `${(v / 1000).toFixed(v >= 10_000 ? 0 : 1)}k` : `${v}`;
}

/** Whole-number percent, and 0 when there is nothing to divide by. */
export function pct(part: number | null | undefined, whole: number | null | undefined): number {
  const w = whole ?? 0;
  if (w <= 0) return 0;
  return Math.round(((part ?? 0) / w) * 100);
}
