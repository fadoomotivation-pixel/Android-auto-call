import { test } from "node:test";
import assert from "node:assert/strict";
import type { Lead } from "./types";
import { act, callQueue, callbackPicks, fuGroup, inChip, lateBy, visitPicks } from "./work";

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

test("call queue: late callbacks oldest first, then the rest latest first", () => {
  const q = callQueue([
    L({ id: "new-old", action_state: "call_now", status: "new", updated_at: at(-5) }),
    L({ id: "late-2h", action_state: "due_today", due_at: at(-2) }),
    L({ id: "later", action_state: "scheduled", due_at: at(30) }),
    L({ id: "late-1d", action_state: "overdue", due_at: at(-26) }),
    L({ id: "new-recent", action_state: "call_now", status: "new", updated_at: at(-1) }),
  ], NOW);
  assert.deepEqual(q.map((l) => l.id), ["late-1d", "late-2h", "new-recent", "new-old"]);
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
