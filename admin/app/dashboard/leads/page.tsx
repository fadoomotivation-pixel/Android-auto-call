import { createClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import type { Profile } from "@/lib/types";
import { LeadManager } from "./LeadManager";

type Sp = { id: string; full_name: string | null; territory: string | null; company_id: string | null; company_name?: string | null };

export default async function LeadsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id, role")
    .eq("id", user!.id)
    .single<Pick<Profile, "company_id" | "role">>();

  // Is this account the platform (super) admin? Only then may they see and
  // assign to telecallers OUTSIDE their own company — a regular company admin
  // must stay strictly scoped to their own team (company isolation).
  const { data: pa } = await supabase
    .from("platform_admins").select("user_id").eq("user_id", user!.id).maybeSingle();
  const isSuper = !!pa;

  if (profile?.role !== "admin" && !isSuper) {
    return <div className="empty">Lead management is available to company admins only.</div>;
  }
  if (!profile?.company_id) {
    return <div className="empty">Your account isn&apos;t linked to a company yet.</div>;
  }

  // Every company on the platform, for a super admin's import target. Read
  // from the companies table rather than inferred from whoever happens to have
  // telecallers — a company with no reps yet can still receive leads, and the
  // import modal must never be left with nothing to pick.
  let allCompanies: [string, string][] = [];

  let salespeople: Sp[] = [];
  // WHEN THIS LIST IS EMPTY, THE IMPORT MODAL IS DEAD AND SAYS NOTHING.
  //
  // Everything downstream is built from it: the company picker is derived from
  // the distinct companies of these reps, the import's target company defaults
  // to the first of those, and the "Which rep?" dropdown is disabled until a
  // company is set. So one silently-failed query here presents to the founder
  // as an unclickable rep selector and a red "Choose a company first" with no
  // company anywhere to choose — which is exactly what it did, because the
  // error was being discarded.
  let repsError: string | null = null;
  if (isSuper) {
    // Service role bypasses per-company RLS so the super admin sees every
    // company's telecallers, each labelled with its company.
    const svc = getServiceSupabase();

    // NO EMBED. `companies(name)` looked like the obvious way to label each
    // rep, and it failed outright with "more than one relationship was found
    // for 'profiles' and 'companies'" — which is why this query returned
    // nothing at all and the whole import flow went dead.
    //
    // There is only ONE foreign key between the two tables. The ambiguity
    // comes from the other twenty-eight: every table carrying both a
    // company_id and a salesperson_id — contacts, call_logs, wa_observed_
    // messages and the rest — reads to PostgREST as a junction offering
    // another possible path, so it refuses to guess. It will only get worse
    // as tables are added, so the join is done here instead: two flat reads
    // and a lookup, which cannot become ambiguous later.
    const [{ data: reps, error: repsErr }, { data: cos, error: coErr }] = await Promise.all([
      svc.from("profiles")
        .select("id, full_name, territory, company_id")
        .eq("role", "salesperson")
        .order("full_name"),
      svc.from("companies").select("id, name").order("name"),
    ]);
    if (repsErr) repsError = repsErr.message;
    if (coErr && !repsError) repsError = coErr.message;

    allCompanies = (cos ?? []).map((c) => [String(c.id), String(c.name ?? "—")] as [string, string]);
    const companyName = new Map(allCompanies);
    salespeople = (reps ?? []).map((r) => {
      const rec = r as { id: string; full_name: string | null; territory: string | null; company_id: string | null };
      return {
        id: rec.id,
        full_name: rec.full_name,
        territory: rec.territory,
        company_id: rec.company_id,
        company_name: rec.company_id ? companyName.get(rec.company_id) ?? null : null,
      };
    });

    // A super admin with their own company's reps beats a super admin with
    // nothing. The cross-company view is the better one, but losing it should
    // degrade the page, not break importing a lead.
    if (salespeople.length === 0) {
      const { data: mine } = await supabase
        .from("profiles")
        .select("id, full_name, territory, company_id")
        .eq("company_id", profile.company_id)
        .eq("role", "salesperson")
        .order("full_name")
        .returns<Sp[]>();
      salespeople = mine ?? [];
      if (!repsError && salespeople.length === 0) {
        repsError = "No telecallers found on this platform.";
      }
    }
  } else {
    const { data: reps } = await supabase
      .from("profiles")
      .select("id, full_name, territory, company_id")
      .eq("company_id", profile.company_id)
      .eq("role", "salesperson")
      .order("full_name")
      .returns<Sp[]>();
    salespeople = reps ?? [];
  }

  return (
    <>
      <h2>Lead Management</h2>
      <p className="subtitle">Upload leads and assign them to your telecallers — they appear instantly in each rep&apos;s app.</p>
      {/* Said out loud rather than left to be inferred from a dropdown that
          will not open. Without the telecaller list there is no company to
          import into and no rep to assign to, and the modal cannot explain
          that from the inside. */}
      {repsError && (
        <div className="error" style={{ marginBottom: 14 }}>
          Could not load the telecaller list, so importing and assigning are
          limited. ({repsError})
        </div>
      )}
      <LeadManager companyId={profile.company_id} salespeople={salespeople} isSuper={isSuper} allCompanies={allCompanies} />
    </>
  );
}
