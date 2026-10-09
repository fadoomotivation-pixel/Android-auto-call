/**
 * The demo company: "Sunrise Infra (Demo data)".
 *
 * A made-up builder with 30 days of example work on it, so the founder can
 * show Call Pro AI to another builder without opening a real customer's
 * data. It is written by migration 0222 (applied by hand) and nothing in the
 * product ever creates it.
 *
 * The id is fixed in that migration, so the admin knows the company without a
 * lookup. `companies.is_demo` says the same thing to SQL.
 *
 * Every screen that shows this company says "Demo data". Every all-companies
 * number the super admin reads (Overview, money card, Platform HQ) leaves it
 * out, so the demo never inflates the real business.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const DEMO_COMPANY_ID = "de000000-0000-4000-8000-000000000001";
export const DEMO_COMPANY_NAME = "Sunrise Infra (Demo data)";
/** The telecaller login for the phone. The password is in the PR that added it. */
export const DEMO_PHONE_LOGIN = "demo.telecaller@callproai.in";
/** The migration that writes the demo, named on screen when it is missing. */
export const DEMO_MIGRATION = "supabase/migrations/0222_a_demo_company_a_founder_can_show.sql";

export function isDemoCompany(id: string | null | undefined): boolean {
  return id === DEMO_COMPANY_ID;
}

export type DemoRefresh =
  | { state: "ready"; anchorDay: string; movedDays: number }
  | { state: "missing" }
  | { state: "error"; message: string };

/**
 * Move the demo forward so its "today" is today, and say whether it exists.
 *
 * demo_refresh() is a no-op on the day it last ran, so calling it on every
 * open of a demo screen is cheap. Without it a demo applied last week would
 * show every "due today" as a week overdue.
 */
export async function refreshDemo(supabase: SupabaseClient): Promise<DemoRefresh> {
  const { data, error } = await supabase.rpc("demo_refresh", { p_company: DEMO_COMPANY_ID });
  if (error) {
    // The function or the company is not there: the migration was not applied.
    if (error.code === "PGRST202" || error.code === "42883" || error.code === "22023" ||
        /demo_refresh|not a demo company/i.test(error.message)) {
      return { state: "missing" };
    }
    return { state: "error", message: error.message };
  }
  const d = data as { ok?: boolean; reason?: string; anchor_day?: string; moved_days?: number } | null;
  if (!d?.ok) return d?.reason === "not_seeded" ? { state: "missing" } : { state: "error", message: "The demo did not answer." };
  return { state: "ready", anchorDay: d.anchor_day ?? "", movedDays: d.moved_days ?? 0 };
}

/**
 * Give the demo's knowledge entries their embedding, once.
 *
 * The migration can write text but not vectors, and match_knowledge searches
 * the vector, so until this runs the AI coach on the phone cannot find the
 * objection replies. knowledge-ingest's edit mode re-embeds an entry in place.
 * Returns how many entries are ready and how many are not.
 */
export async function embedDemoKnowledge(supabase: SupabaseClient): Promise<{ ready: number; missing: number }> {
  const { data: rows } = await supabase.from("knowledge_chunks")
    .select("id, title, content")
    .eq("company_id", DEMO_COMPANY_ID)
    .is("embedding", null)
    .returns<Array<{ id: string; title: string | null; content: string }>>();
  const todo = rows ?? [];
  if (todo.length) {
    await Promise.allSettled(todo.map((r) => supabase.functions.invoke("knowledge-ingest", {
      body: { mode: "edit", id: r.id, content: r.content, title: r.title },
    })));
  }
  const [{ count: total }, { count: left }] = await Promise.all([
    supabase.from("knowledge_chunks").select("id", { count: "exact", head: true }).eq("company_id", DEMO_COMPANY_ID),
    supabase.from("knowledge_chunks").select("id", { count: "exact", head: true })
      .eq("company_id", DEMO_COMPANY_ID).is("embedding", null),
  ]);
  return { ready: Math.max(0, (total ?? 0) - (left ?? 0)), missing: left ?? 0 };
}
