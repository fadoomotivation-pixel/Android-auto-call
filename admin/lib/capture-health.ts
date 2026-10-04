/**
 * Is a rep's WhatsApp capture dead, and since when.
 *
 * The clock is status + last_seen_at + the newest captured message.
 * link_ok_at is not an input. Heartbeats write it on every ping, including
 * while WhatsApp has logged the session out, so a fresh value proves only
 * that the worker process is reachable.
 */

export interface CaptureSessionInput {
  status: string;
  last_seen_at: string | null;
  last_error: string | null;
}

/** Why the banner is showing. None of these is a live capture. */
export type CaptureReason =
  | "logged_out"
  | "disconnected"
  | "needs_scan"
  | "stale"
  | "unproven";

export interface DeadCapture {
  reason: CaptureReason;
  /** Status text as stored, so the banner can name it without calling it up. */
  status: string;
  /** Session row's last_seen_at, when the timestamp parses. Not a heartbeat. */
  lastSeenAt: string | null;
}

const LOGGED_OUT = /logged out|logged this session out/i;

function cleanIso(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : iso;
}

/**
 * A session the dashboard must shout about, or null when this row is not
 * an outage.
 *
 * `connected` and `connecting` are the only statuses that stay quiet.
 * `connecting` is a worker restart, which clears on its own; telling someone
 * to re-scan during it is the false alarm this screen has raised before.
 * Anything else is not a proven live capture. A fresh heartbeat cannot
 * cancel that, because this function never sees one.
 */
export function classifyCapture(row: CaptureSessionInput): DeadCapture | null {
  const status = String(row.status ?? "").trim().toLowerCase();
  if (status === "connected" || status === "connecting") return null;

  let reason: CaptureReason;
  if (status === "logged_out" || LOGGED_OUT.test(row.last_error ?? "")) {
    reason = "logged_out";
  } else if (status === "qr") {
    reason = "needs_scan";
  } else if (status === "offline") {
    reason = "stale";
  } else if (status === "disconnected" || status === "") {
    reason = "disconnected";
  } else {
    reason = "unproven";
  }

  return {
    reason,
    status: status || "disconnected",
    lastSeenAt: cleanIso(row.last_seen_at),
  };
}

export function reasonLabel(reason: CaptureReason, status: string): string {
  switch (reason) {
    case "logged_out":
      return "logged out";
    case "disconnected":
      return "disconnected";
    case "needs_scan":
      return "waiting for a QR scan";
    case "stale":
      return "stale — the watchdog marked this watcher offline";
    case "unproven":
      return `status “${status.slice(0, 40)}” is not a live capture`;
  }
}

/**
 * Which moment to sort and count from. The older of the last captured
 * message and last_seen_at, so a later non-message stamp cannot make an
 * outage look shorter. Null when neither timestamp exists — the banner
 * still shows, and says the duration is unknown.
 */
export function outageSince(lastSeenAt: string | null, lastMessageAt: string | null): string | null {
  const seen = cleanIso(lastSeenAt);
  const message = cleanIso(lastMessageAt);
  if (seen && message) return new Date(message).getTime() < new Date(seen).getTime() ? message : seen;
  return message ?? seen;
}
