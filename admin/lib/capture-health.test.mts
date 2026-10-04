import assert from "node:assert/strict";
import { classifyCapture, outageSince } from "./capture-health.ts";

// 4 Oct 2026, Fanbe / Ankita, measured in production.
// link_ok_at was refreshed the same afternoon. It must not decide the banner
// and must not supply the "how long" clock.
const live = {
  status: "disconnected",
  last_seen_at: "2026-09-29T14:01:19.244Z",
  last_error: "WhatsApp logged this session out. Press Re-scan and scan the new QR.",
  link_ok_at: "2026-10-04T10:44:00.000Z",
};
const verdict = classifyCapture(live);
assert.ok(verdict);
assert.equal(verdict.reason, "logged_out");
assert.equal(verdict.status, "disconnected");
assert.equal(verdict.lastSeenAt, "2026-09-29T14:01:19.244Z");
assert.equal(JSON.stringify(verdict).includes("2026-10-04"), false);

assert.equal(
  outageSince("2026-09-29T14:01:19.244Z", "2026-09-25T23:44:34.000Z"),
  "2026-09-25T23:44:34.000Z",
);

// A worker that says connected stays off the banner. Age of last_seen_at
// does not override that, and neither would a heartbeat.
assert.equal(classifyCapture({
  status: "connected",
  last_seen_at: "2026-09-25T23:44:34.000Z",
  last_error: null,
}), null);

// A restart is not an outage.
assert.equal(classifyCapture({
  status: "connecting",
  last_seen_at: null,
  last_error: null,
}), null);

assert.equal(classifyCapture({
  status: "offline",
  last_seen_at: "2026-09-17T01:09:00.000Z",
  last_error: "No word from this rep's watcher for 14 hours.",
})?.reason, "stale");

assert.equal(classifyCapture({
  status: "qr",
  last_seen_at: null,
  last_error: null,
})?.reason, "needs_scan");

assert.equal(classifyCapture({
  status: "disconnected",
  last_seen_at: null,
  last_error: null,
})?.reason, "disconnected");

assert.equal(classifyCapture({
  status: "mystery",
  last_seen_at: "not-a-date",
  last_error: null,
})?.lastSeenAt, null);

console.log("capture-health ok");
