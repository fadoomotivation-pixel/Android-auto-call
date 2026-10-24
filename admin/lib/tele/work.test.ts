import { test } from "node:test";
import assert from "node:assert/strict";
import type { Lead } from "./types";
import { act, callQueue, callbackPicks, dueSignal, fuGroup, inChip, lateBy, visitPicks } from "./work";

const NOW = new Date(2026, 9, 21, 15, 0, 0).getTime(); // 21 Oct 2026, 3:00 PM local
const at = (h: number) => new Date(NOW + h * 3600000).toISOString();
const L = (p: Partial<Lead>): Lead => ({ id: p.id ?? "x", name: null, phone: "9876543210", status: "follow_up", temperature: null,
  attempts: 0, notes: null, company_name: null, updated_at: at(-1), action_state: "scheduled", due_at: null, ...p });

test("a callback whose time arrives moves to Call now without a reload", () => {
  const l = L({ action_state: "due_today", due_at: at(-0.1) });
  assert.equal(act(l, NOW), "call_now");
  assert.ok(inChip(l, "call_now", NOW));
});

test("yesterday's booked time is Overdue, and Overdue is inside Call now", () => {
  const l = L({ action_state: "scheduled", due_at: at(-20) });
  assert.equal(act(l, NOW), "overdue");
  assert.ok(inChip(l, "call_now", NOW));
  assert.ok(inChip(l, "overdue", NOW));
});

test("Later becomes Due today when the day arrives", () => {
  assert.equal(act(L({ action_state: "scheduled", due_at: at(5) }), NOW), "due_today");
  assert.equal(act(L({ action_state: "scheduled", due_at: at(30) }), NOW), "scheduled");
});

test("the server's answer is kept when the clock has nothing to add", () => {
  assert.equal(act(L({ action_state: "awaiting_visit", due_at: null }), NOW), "awaiting_visit");
  assert.equal(act(L({ action_state: "no_next_step" }), NOW), "no_next_step");
});

test("Follow Ups: three groups, due beats done", () => {
  assert.equal(fuGroup(L({ due_at: at(-1), handled_today: true }), NOW), "now");
  assert.equal(fuGroup(L({ due_at: at(20), handled_today: true }), NOW), "done");
  assert.equal(fuGroup(L({ due_at: at(20), handled_today: false }), NOW), "later");
  assert.equal(fuGroup(L({ due_at: null, status: "follow_up" }), NOW), "now");
  assert.equal(fuGroup(L({ due_at: null, status: "interested" }), NOW), null);
  assert.equal(fuGroup(L({ due_at: at(-1), action_state: "none" }), NOW), null);
});

test("call queue: Android's five tiers — waiting buyer, promise, spoke, few rings, many rings", () => {
  const q = callQueue([
    L({ id: "never-x5", action_state: "call_now", calls_total: 5, best_call_seconds: 0, created_at: at(-200) }),
    L({ id: "new-old", action_state: "call_now", status: "new", created_at: at(-5) }),
    L({ id: "spoke-early", action_state: "call_now", calls_total: 2, best_call_seconds: 120, last_call_at: at(-30) }),
    L({ id: "late-2h", action_state: "due_today", due_at: at(-2) }),
    L({ id: "later", action_state: "scheduled", due_at: at(30) }),
    L({ id: "promise", action_state: "call_now", promise_due_since: at(-48), promise_text: "Send location" }),
    L({ id: "late-1d", action_state: "overdue", due_at: at(-26) }),
    L({ id: "spoke-late", action_state: "call_now", calls_total: 3, best_call_seconds: 45, last_call_at: at(-2) }),
    L({ id: "wrote", action_state: "call_now", waiting_since: at(-3) }),
    L({ id: "new-recent", action_state: "call_now", status: "new", created_at: at(-1) }),
  ], NOW);
  // Inside a tier: the due time, or when the lead arrived when there is none —
  // a lead that came in 5h ago is older than a callback that fell due 2h ago.
  assert.deepEqual(q.map((l) => l.id), [
    "wrote", "promise", "spoke-late", "spoke-early", "late-1d", "new-old", "late-2h", "new-recent", "never-x5",
  ]);
});

test("why a row is due, in Android's words", () => {
  assert.equal(dueSignal(L({ waiting_since: at(-3) }), NOW), "They wrote 3h ago — no reply yet");
  assert.equal(dueSignal(L({ promise_due_since: at(-48), promise_text: "Send location" }), NOW), "You said: Send location · 2d ago");
  assert.equal(dueSignal(L({ calls_total: 5, best_call_seconds: 0 }), NOW), "Rung 5 times — never picked up");
  assert.equal(dueSignal(L({ calls_total: 5, best_call_seconds: 60 }), NOW), null);
});

test("late labels", () => {
  assert.equal(lateBy(at(-0.05), NOW), null);
  assert.equal(lateBy(at(-0.5), NOW), "30 min late");
  assert.equal(lateBy(at(-3), NOW), "3 h late");
  assert.equal(lateBy(at(-50), NOW), "2 d late");
});

test("quick picks are all in the future", () => {
  const now = new Date(NOW);
  for (const p of [...callbackPicks(now), ...visitPicks(now)]) assert.ok(p.at.getTime() > NOW, p.label);
  assert.equal(visitPicks(now).find((p) => p.label.startsWith("Saturday"))!.at.getDay(), 6);
});
