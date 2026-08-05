/**
 * The lead lifecycle, for the dashboard.
 *
 * Sits beside format.ts / health.ts / metrics.ts as the fourth shared
 * source-of-truth layer, and is the ONLY place the web learns what a stage is.
 *
 * WHY IT READS THE DATABASE INSTEAD OF DECLARING A LIST. The board used to
 * carry `STATUS_FILTERS`, nine chips typed by hand. Four live statuses had no
 * chip at all — 91 leads (11.6% of the book) could not be selected by any
 * filter — while three chips matched zero rows. Meanwhile the Android app had
 * its own seven-stage list and its own eight tab buckets, and the two clients
 * disagreed with each other and with the reports.
 *
 * `lead_stages` owns code, label, colour, order and semantics. Both clients
 * read those rows. A stage added tomorrow appears on the web, on the phone and
 * in every report without anybody editing a list.
 *
 * The two axes are kept apart here as firmly as they are in the database:
 * a STAGE is where the deal is, an ACTION STATE is what to do now, and no
 * function in this file mixes them.
 */

import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

export type Outcome = "open" | "won" | "lost" | "excluded";

export type Stage = {
  code: string;
  label: string;
  color: string;
  sort_order: number;
  is_terminal: boolean;
  outcome: Outcome;
  is_pipeline: boolean;
  is_advanced: boolean;
  counts_as_sale: boolean;
  rep_visible: boolean;
  analytics_visible: boolean;
};

const COLUMNS =
  "code, label, color, sort_order, is_terminal, outcome, is_pipeline, is_advanced, counts_as_sale, rep_visible, analytics_visible";

/**
 * Every stage, in funnel order.
 *
 * Wrapped in React `cache()` so a page rendering the chips, a table and a
 * summary card makes ONE query, matching how loadIdentity in scope.ts already
 * behaves. The stage table is ten rows that change about once a year.
 */
export const loadStages = cache(async (supabase: SupabaseClient): Promise<Stage[]> => {
  const { data, error } = await supabase
    .from("lead_stages")
    .select(COLUMNS)
    .order("sort_order")
    .returns<Stage[]>();
  if (error) throw error;
  return data ?? [];
});

/* ─────────────────────────── stage: where the deal is ─────────────────────── */

/** Chips a telecaller-facing screen may show. Hides `invalid` (bad number). */
export function repStages(stages: Stage[]): Stage[] {
  return stages.filter((s) => s.rep_visible);
}

/** Stages that belong in funnel analytics. Excludes bad-number rows, which
 *  would otherwise inflate "lost" and understate the real loss rate. */
export function analyticsStages(stages: Stage[]): Stage[] {
  return stages.filter((s) => s.analytics_visible);
}

/** "Pipeline" — a DERIVED bucket over stages, never a stage itself. */
export function pipelineStages(stages: Stage[]): Stage[] {
  return stages.filter((s) => s.is_pipeline);
}

export function stageBy(stages: Stage[], code: string | null | undefined): Stage | undefined {
  return code ? stages.find((s) => s.code === code) : undefined;
}

export function stageLabel(stages: Stage[], code: string | null | undefined): string {
  return stageBy(stages, code)?.label ?? "—";
}

export function stageColor(stages: Stage[], code: string | null | undefined): string {
  return stageBy(stages, code)?.color ?? "#6A7B85";
}

/* ────────────────────── action state: what to do now ─────────────────────── */

export type ActionState =
  | "overdue"
  | "call_now"
  | "due_today"
  | "scheduled"
  | "awaiting_visit"
  | "no_next_step"
  | "none";

/**
 * The action row, in the order a rep works their day.
 *
 * Mirrors v_lead_action_state exactly — the database decides which state a
 * lead is in, this only decides how to say it. `none` is absent on purpose:
 * a finished lead has nothing to do and does not need a chip.
 */
export const ACTION_STATES: { code: ActionState; label: string; color: string; hint: string }[] = [
  { code: "overdue",        label: "Overdue",      color: "#C0452C",
    hint: "You promised these earlier and the time has passed. Call these first." },
  { code: "call_now",       label: "Call now",     color: "#C98A3E",
    hint: "Due right now, brand new, or nobody picked up last time." },
  { code: "due_today",      label: "Due today",    color: "#3E7F8A",
    hint: "Booked for later today. They will move into Call now on their own." },
  { code: "scheduled",      label: "Scheduled",    color: "#5A62C9",
    hint: "Booked for another day. Nothing to do yet — this is a plan, not a backlog." },
  { code: "awaiting_visit", label: "Visit coming", color: "#75629B",
    hint: "A site visit is booked. Waiting on the customer to turn up." },
  { code: "no_next_step",   label: "No next step", color: "#8A6D3B",
    hint: "You spoke to them and nothing is booked. These go cold if nobody acts." },
];

export function actionLabel(code: string | null | undefined): string {
  return ACTION_STATES.find((a) => a.code === code)?.label ?? "Done";
}

export function actionColor(code: string | null | undefined): string {
  return ACTION_STATES.find((a) => a.code === code)?.color ?? "#5D6862";
}

/** The states that are actual work. Used for "how much is on my plate". */
export const WORK_STATES: ActionState[] = ["overdue", "call_now"];

/* ─────────────────────────── the shared row shape ────────────────────────── */

/** One row of v_lead_workstate — the same row the Android app reads. */
export type WorkstateRow = {
  contact_id: string;
  company_id: string;
  salesperson_id: string | null;
  name: string | null;
  phone: string;
  disposition: string;
  stage: string;
  stage_label: string;
  stage_color: string;
  stage_sort: number;
  outcome: Outcome;
  is_terminal: boolean;
  is_pipeline: boolean;
  is_advanced: boolean;
  counts_as_sale: boolean;
  action_state: ActionState;
  due_at: string | null;
  site_visit_at: string | null;
  created_at: string;
  last_contacted_at: string | null;
  handled_at: string | null;
  temperature: string | null;
  is_due_today: boolean;
  handled_today: boolean;
};

export const WORKSTATE_COLUMNS =
  "contact_id, company_id, salesperson_id, name, phone, disposition, stage, stage_label, stage_color, stage_sort, outcome, is_terminal, is_pipeline, is_advanced, counts_as_sale, action_state, due_at, site_visit_at, created_at, last_contacted_at, handled_at, temperature, is_due_today, handled_today";

/** Count leads per stage code, from the one view both clients read. */
export function countByStage(rows: WorkstateRow[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.stage, (m.get(r.stage) ?? 0) + 1);
  return m;
}

/** Count leads per action state, from the same rows. */
export function countByAction(rows: WorkstateRow[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.action_state, (m.get(r.action_state) ?? 0) + 1);
  return m;
}
