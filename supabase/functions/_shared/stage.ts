// The canonical lead lifecycle, for edge functions.
//
// Every function here used to carry its own status list, and they disagreed:
// win-harvest called a site visit a WIN, focus-five and lead-insights each had
// their own CLOSED, sales-velocity had ADVANCED, knowledge-sync had another
// won-list. Ten definitions of the same three ideas.
//
// There is now one: the `lead_stages` table. This module reads it once per
// invocation and answers in terms of it. Nothing in supabase/functions should
// contain a status literal used to mean "won", "closed", "open" or "advanced"
// ever again — a disposition-specific question (did they literally say
// not_interested) may still name a status, because that is what status means.

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export type StageRow = {
  code: string;
  label: string;
  color: string;
  sort_order: number;
  is_terminal: boolean;
  outcome: "open" | "won" | "lost" | "excluded";
  is_pipeline: boolean;
  is_advanced: boolean;
  counts_as_sale: boolean;
  rep_visible: boolean;
  analytics_visible: boolean;
};

/** The disposition → stage mapping, mirroring public.lead_stage_for(). */
const STAGE_OF: Record<string, string> = {
  new: "new",
  queued: "new",
  called: "contacted",
  no_answer: "contacted",
  busy: "contacted",
  wrong_person: "contacted",
  callback: "contacted",
  follow_up: "contacted",
  interested: "interested",
  site_visit: "site_visit",
  proposal: "negotiation",
  negotiation: "negotiation",
  token_paid: "token_paid",
  booked: "won",
  not_interested: "lost",
  lost: "lost",
  dnc: "dnc",
  invalid: "invalid",
};

let cache: Map<string, StageRow> | null = null;

/**
 * Load the stage table. Cached for the lifetime of the isolate, which is the
 * right scope: stage semantics change about once a year, and a per-request
 * fetch would add a round trip to every cron tick.
 */
export async function loadStages(db: SupabaseClient): Promise<Map<string, StageRow>> {
  if (cache) return cache;
  const { data, error } = await db
    .from("lead_stages")
    .select("code, label, color, sort_order, is_terminal, outcome, is_pipeline, is_advanced, counts_as_sale, rep_visible, analytics_visible")
    .order("sort_order");
  if (error) throw error;
  cache = new Map((data as StageRow[]).map((r) => [r.code, r]));
  return cache;
}

/** Stage code for a raw disposition. Unknown values fall to `contacted`
 *  rather than throwing — an unmapped status must never take a cron down. */
export function stageOf(status: string | null | undefined): string {
  if (!status) return "new";
  return STAGE_OF[status] ?? "contacted";
}

function rowOf(stages: Map<string, StageRow>, status: string | null | undefined): StageRow | undefined {
  return stages.get(stageOf(status));
}

/** Deal is finished, either way. Replaces every hand-written CLOSED list. */
export function isClosed(stages: Map<string, StageRow>, status: string | null | undefined): boolean {
  return rowOf(stages, status)?.is_terminal ?? false;
}

export function isOpen(stages: Map<string, StageRow>, status: string | null | undefined): boolean {
  return !isClosed(stages, status);
}

/** Actually won. NOT "reached a site visit" — that was the win-harvest bug. */
export function isWon(stages: Map<string, StageRow>, status: string | null | undefined): boolean {
  return rowOf(stages, status)?.outcome === "won";
}

/** Money has changed hands: token_paid or won. Use for revenue, never `won`. */
export function countsAsSale(stages: Map<string, StageRow>, status: string | null | undefined): boolean {
  return rowOf(stages, status)?.counts_as_sale ?? false;
}

/** Reached Interested or beyond and not lost. The canonical funnel bucket. */
export function isAdvanced(stages: Map<string, StageRow>, status: string | null | undefined): boolean {
  return rowOf(stages, status)?.is_advanced ?? false;
}

/** Deal in motion: past qualification, before the close. "Pipeline". */
export function isPipeline(stages: Map<string, StageRow>, status: string | null | undefined): boolean {
  return rowOf(stages, status)?.is_pipeline ?? false;
}

export function labelOf(stages: Map<string, StageRow>, status: string | null | undefined): string {
  return rowOf(stages, status)?.label ?? "Contacted";
}

/**
 * Terminal stage codes, for a PostgREST `.not("stage", "in", …)` filter.
 *
 * PostgREST cannot call lead_is_open() in a filter, so the codes have to travel
 * as a literal list — but it is BUILT FROM THE TABLE at request time, not typed
 * into the file. Add a terminal stage tomorrow and these queries follow it
 * without a redeploy, which is the whole point.
 */
export function terminalCodes(stages: Map<string, StageRow>): string[] {
  return [...stages.values()].filter((s) => s.is_terminal).map((s) => s.code);
}

/** `(won,lost,dnc,invalid)` — ready to drop into a PostgREST `in` filter. */
export function terminalFilter(stages: Map<string, StageRow>): string {
  return `(${terminalCodes(stages).join(",")})`;
}

/**
 * The dispositions a rep — or the AI on their behalf — may choose.
 *
 * This existed in THREE places with three different contents: voice-note-ai had
 * nine values, _shared/summarize.ts and amr-convert had seven including the
 * legacy `proposal` and missing `negotiation`, `token_paid` and `lost`. So the
 * same call could be classified `proposal` down one path and `negotiation` down
 * another, and two of the three could never suggest a token payment at all.
 *
 * One list, mirroring the app's settable stages. `proposal` is deliberately not
 * offered — it is a legacy value that maps to the negotiation stage and should
 * not be produced by anything new.
 */
export const DISPOSITIONS = [
  "interested",
  "site_visit",
  "negotiation",
  "token_paid",
  "booked",
  "callback",
  "not_interested",
  "lost",
  "dnc",
] as const;
