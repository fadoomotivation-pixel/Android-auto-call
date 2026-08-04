"use client";

/**
 * Automation Health — seven lights, and a reason under every red one.
 *
 * A green light that means "probably fine" is worse than no light, so each
 * check here is tied to something observable: a cron's last run time, a
 * response code pg_net actually recorded, the depth of the outbox, a live
 * answer from the Baileys worker, a count of subscribers. Nothing is inferred
 * from "the code looks right".
 *
 * The reason line is the whole feature. "🔴 Founder Alerts" tells a founder to
 * ask someone; "🔴 Founder Alerts — Baileys disconnected, scan the QR on the
 * WhatsApp page" tells them what to do. Every red state here names the thing
 * that is broken and where it is fixed.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Cron = {
  job: string; schedule: string; active: boolean;
  last_run: string | null; last_status: string | null; last_message: string | null;
  minutes_since: number | null; stale_after_minutes: number;
};
type Db = {
  checked_at: string;
  crons: Cron[];
  http: {
    window_hours: number; calls: number; errors: number; timeouts: number;
    last_error_at: string | null; last_error_code: number | null; last_error_body: string | null;
  };
  queue: { queued: number; oldest_queued_at: string | null; failed_24h: number; last_error: string | null };
  recipients: { founder_pulse: number; founder_alerts: number; rep_pulse: number; inactive: number; failing: number };
  last_send: Record<string, { last_sent_at: string | null; last_failed_at: string | null; sent_24h: number }>;
};
type Route = {
  provider: "baileys" | "meta"; via: string; lender: string | null;
  connected: boolean; number: string | null; last_seen: string | null;
  error: string | null; note?: string;
};

export type Verdict = { level: "ok" | "warn" | "bad" | "unknown"; label: string; reason: string; fix?: { href: string; label: string } };

const DOT = { ok: "🟢", warn: "🟡", bad: "🔴", unknown: "⚪" } as const;

function ist(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true,
  });
}

function cronOf(db: Db | null, name: string): Cron | null {
  return db?.crons?.find((c) => c.job === name) ?? null;
}

/** A cron is healthy when it is switched on, ran recently, and did not error. */
function cronVerdict(c: Cron | null, human: string): Verdict | null {
  if (!c) {
    return { level: "unknown", label: human, reason: `The ${human} cron job does not exist in this database.` };
  }
  if (!c.active) {
    return { level: "bad", label: human, reason: `The cron job "${c.job}" is switched off. Nothing will fire until it is re-enabled.` };
  }
  if (c.last_run == null) {
    return { level: "warn", label: human, reason: `Scheduled (${c.schedule}) but has never run yet.` };
  }
  if (c.last_status !== "succeeded") {
    return { level: "bad", label: human, reason: `Last run ${ist(c.last_run)} ended "${c.last_status}". ${c.last_message ?? ""}`.trim() };
  }
  if ((c.minutes_since ?? 0) > c.stale_after_minutes) {
    return {
      level: "bad", label: human,
      reason: `Has not run for ${c.minutes_since} minutes — it is scheduled ${c.schedule}. The scheduler is stuck, not the message.`,
    };
  }
  return null;
}

export function Health({ companyId, companyName }: { companyId: string | null; companyName: string }) {
  const [db, setDb] = useState<Db | null>(null);
  const [route, setRoute] = useState<Route | null>(null);
  const [routeReason, setRouteReason] = useState<string | null>(null);
  const [probeFailed, setProbeFailed] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  const load = useCallback(async () => {
    setBusy(true);
    setErr(null);
    const supabase = createClient();
    try {
      // The DB half and the live probe are independent: a dead Baileys worker
      // must not stop the cron verdict from rendering, which is exactly when
      // someone needs it most.
      const [h, r] = await Promise.all([
        supabase.rpc("automation_health", { p_company: companyId }),
        // The route probe needs one company — there is no such thing as "the
        // platform's provider" when each tenant can be on a different pipe.
        companyId
          ? supabase.functions.invoke("notify-provider", { body: { action: "route", company_id: companyId } })
          : Promise.resolve({ data: null, error: null }),
      ]);
      if (h.error) throw h.error;
      setDb(h.data as Db);
      // A probe that could not run is its own state. Folding it into "no route"
      // would light the Meta check green on the strength of never having asked.
      const rerr = (r as { error?: { message?: string } | null }).error;
      const rd = (r as { data?: { route?: Route | null; reason?: string } | null }).data;
      setRoute(rd?.route ?? null);
      setProbeFailed(rerr ? (rerr.message ?? "The provider probe did not answer.") : null);
      setRouteReason(rd?.reason ?? null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not read health");
    } finally {
      setBusy(false);
    }
  }, [companyId]);

  useEffect(() => { void load(); }, [load]);

  const checks: Verdict[] = [];

  // 1 — Founder Alerts, end to end: cron, then recipients.
  const alertCron = cronVerdict(cronOf(db, "founder-alerts-15min"), "Founder Alerts");
  if (alertCron) checks.push(alertCron);
  else if (db && db.recipients.founder_alerts === 0) {
    checks.push({
      level: "bad", label: "Founder Alerts",
      reason: "Running every 15 minutes, but nobody is set to receive alerts. Bookings are being " +
        "detected and delivered to no one.",
      fix: { href: "/dashboard/pulse", label: "Add a recipient" },
    });
  } else if (db) {
    checks.push({
      level: "ok", label: "Founder Alerts",
      reason: `Swept ${cronOf(db, "founder-alerts-15min")?.minutes_since ?? 0} min ago · ` +
        `${db.recipients.founder_alerts} recipient${db.recipients.founder_alerts === 1 ? "" : "s"}`,
    });
  }

  // 2 — Daily Pulse.
  const pulseCron = cronVerdict(cronOf(db, "pulse-broadcast-hourly"), "Daily Pulse");
  if (pulseCron) checks.push(pulseCron);
  else if (db && db.recipients.founder_pulse + db.recipients.rep_pulse === 0) {
    checks.push({
      level: "bad", label: "Daily Pulse",
      reason: "The hourly cron is running, but no recipient is configured. The report goes to nobody.",
      fix: { href: "/dashboard/pulse", label: "Add a recipient" },
    });
  } else if (db && db.recipients.failing > 0) {
    checks.push({
      level: "warn", label: "Daily Pulse",
      reason: `${db.recipients.failing} recipient${db.recipients.failing === 1 ? "" : "s"} failed on the last send. ` +
        "The schedule is fine; the delivery is not.",
      fix: { href: "/dashboard/pulse", label: "See the reason per recipient" },
    });
  } else if (db) {
    checks.push({
      level: "ok", label: "Daily Pulse",
      reason: `${db.recipients.founder_pulse} founder · ${db.recipients.rep_pulse} telecaller`,
    });
  }

  // 3 — Baileys, live from the worker.
  if (!companyId) {
    checks.push({
      level: "unknown", label: "Baileys Connected",
      reason: "Pick one company above — each tenant can be on a different WhatsApp pipe, so there " +
        "is no single answer across all of them.",
    });
  } else if (probeFailed) {
    checks.push({
      level: "unknown", label: "Baileys Connected",
      reason: `Could not ask: ${probeFailed}`,
    });
  } else if (routeReason) {
    checks.push({
      level: "bad", label: "Baileys Connected",
      reason: routeReason,
      fix: { href: "/dashboard/whatsapp", label: "Set up WhatsApp" },
    });
  } else if (route?.provider === "baileys") {
    checks.push(route.connected
      ? {
          level: "ok", label: "Baileys Connected",
          reason: `${route.number ?? "connected"}${route.lender ? ` · lent by ${route.lender}` : ""}` +
            `${route.last_seen ? ` · seen ${ist(route.last_seen)}` : ""}`,
        }
      : {
          level: "bad", label: "Baileys Connected",
          reason: route.error ?? "The worker says it is not logged in. Every founder message will be " +
            "held in the queue until the session is back.",
          fix: { href: "/dashboard/whatsapp", label: "Scan the QR" },
        });
  } else if (route) {
    checks.push({
      level: "warn", label: "Baileys Connected",
      reason: `${companyName} is not on Baileys — its notifications go out over Meta instead.`,
    });
  }

  // 4 — Meta, which is credentials rather than a session.
  if (!companyId) {
    checks.push({ level: "unknown", label: "Meta Connected", reason: "Pick one company above." });
  } else if (probeFailed || (!route && !routeReason)) {
    checks.push({
      level: "unknown", label: "Meta Connected",
      reason: probeFailed ?? "The provider probe returned nothing.",
    });
  } else if (route?.provider === "meta") {
    checks.push(route.connected
      ? {
          level: "ok", label: "Meta Connected",
          reason: route.note ?? "Credentials present.",
        }
      : {
          level: "bad", label: "Meta Connected",
          reason: route.error ?? "Credentials are missing.",
          fix: { href: "/dashboard/whatsapp", label: "Fix the connection" },
        });
  } else {
    checks.push({
      level: "ok", label: "Meta Connected",
      reason: "Not carrying this company's notifications — it carries customer replies from the " +
        "Team Inbox, which is the only thing it should ever carry.",
    });
  }

  // 5 — The queue: the difference between "lost" and "late".
  const drain = cronVerdict(cronOf(db, "notification-outbox-drain"), "Notification Queue");
  if (drain) checks.push(drain);
  else if (db && db.queue.queued > 0) {
    const oldMin = db.queue.oldest_queued_at
      ? Math.floor((Date.now() - Date.parse(db.queue.oldest_queued_at)) / 60000) : 0;
    checks.push({
      level: oldMin > 30 ? "bad" : "warn", label: "Notification Queue",
      reason: `${db.queue.queued} message${db.queue.queued === 1 ? "" : "s"} held, oldest ${oldMin} min. ` +
        (oldMin > 30
          ? "Past 30 minutes the retries are losing — the pipe is still down."
          : "The drain runs every five minutes; this normally clears itself.") +
        (db.queue.last_error ? ` Last reason: ${db.queue.last_error}` : ""),
    });
  } else if (db && db.queue.failed_24h > 0) {
    checks.push({
      level: "warn", label: "Notification Queue",
      reason: `Empty now, but ${db.queue.failed_24h} message${db.queue.failed_24h === 1 ? "" : "s"} gave up in the ` +
        `last 24 hours. ${db.queue.last_error ?? ""}`.trim(),
    });
  } else if (db) {
    checks.push({ level: "ok", label: "Notification Queue", reason: "Empty. Nothing is waiting." });
  }

  // 6 — Edge functions, judged by what the crons got back.
  if (db) {
    const { errors, timeouts, calls, window_hours, last_error_code, last_error_body, last_error_at } = db.http;
    if (errors > 0) {
      checks.push({
        level: "bad", label: "Edge Functions",
        reason: `${errors} of ${calls} scheduled calls were refused in the last ${window_hours} hours. ` +
          `Last was ${last_error_code ?? "?"} at ${ist(last_error_at)}: ${last_error_body ?? "no body"}. ` +
          (last_error_code === 401
            ? "A 401 means a deploy switched verify_jwt back on — the cron's key is now being rejected."
            : ""),
      });
    } else {
      checks.push({
        level: "ok", label: "Edge Functions",
        reason: `${calls - timeouts} of ${calls} scheduled calls answered cleanly in the last ${window_hours} hours` +
          (timeouts > 0
            ? `. ${timeouts} timed out — pg_net stops listening after five seconds while the function carries on, so these are not failures.`
            : "."),
      });
    }
  }

  // 7 — The scheduler itself, as one line.
  if (db) {
    const stuck = (db.crons ?? []).filter((c) => !c.active || (c.minutes_since ?? 0) > c.stale_after_minutes);
    checks.push(stuck.length === 0
      ? {
          level: "ok", label: "Cron Running",
          reason: (db.crons ?? []).map((c) => `${c.job.replace(/-\d+\w*$/, "")} ${c.minutes_since}m`).join(" · "),
        }
      : {
          level: "bad", label: "Cron Running",
          reason: `${stuck.map((c) => c.job).join(", ")} ${stuck.length === 1 ? "is" : "are"} not running on schedule.`,
        });
  }

  const worst = checks.some((c) => c.level === "bad") ? "bad"
    : checks.some((c) => c.level === "warn") ? "warn" : "ok";

  return (
    <section className="card" style={{ padding: "15px 17px", marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0, fontSize: 16.5 }}>
          {DOT[worst]} Automation Health
          <span style={{ fontSize: 12.5, color: "var(--muted)", fontWeight: 400, marginLeft: 9 }}>
            {companyId ? companyName : "all companies"}
          </span>
        </h3>
        <button onClick={() => void load()} disabled={busy}
          style={{
            fontSize: 12, padding: "5px 12px", borderRadius: 7, cursor: "pointer",
            border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: "var(--muted)",
          }}>
          {busy ? "Checking…" : "Re-check"}
        </button>
      </div>

      {err && (
        <div style={{ marginTop: 10, fontSize: 12.5, color: "#fca5a5" }}>
          Could not read health: {err}
        </div>
      )}

      {busy && !db && (
        <div style={{ marginTop: 10, fontSize: 12.5, color: "var(--muted)" }}>
          Reading the crons, the queue and the WhatsApp worker…
        </div>
      )}

      <div style={{ marginTop: 12, display: "grid", gap: 1 }}>
        {checks.map((c) => (
          <div key={c.label} style={{
            display: "grid", gridTemplateColumns: "22px minmax(140px,168px) 1fr", gap: 10,
            alignItems: "baseline", padding: "8px 0",
            borderTop: "1px solid rgba(255,255,255,0.055)", fontSize: 13,
          }}>
            <span aria-hidden>{DOT[c.level]}</span>
            <strong style={{ fontWeight: 600 }}>{c.label}</strong>
            <span style={{
              color: c.level === "bad" ? "#fca5a5" : c.level === "warn" ? "#fcd34d" : "var(--muted)",
              fontSize: 12.5, lineHeight: 1.5,
            }}>
              {c.reason}
              {c.fix && (
                <> <Link href={c.fix.href} style={{ whiteSpace: "nowrap" }}>{c.fix.label} →</Link></>
              )}
            </span>
          </div>
        ))}
      </div>

      {db && (
        <div style={{ marginTop: 11, fontSize: 11.5, color: "var(--muted)" }}>
          Checked {ist(db.checked_at)}. Crons, queue depth and response codes come from the database;
          the WhatsApp line is a live question put to the worker just now.
        </div>
      )}
    </section>
  );
}
