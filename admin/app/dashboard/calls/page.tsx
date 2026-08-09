import { createClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import type { Profile } from "@/lib/types";
import { CallsBoard, type CallRow } from "./CallsBoard";

const tail10 = (p: string | null | undefined) => (p ?? "").replace(/\D/g, "").slice(-10);

/**
 * since-timestamp for the range filter (default: last 7 days).
 *
 * "Today" means today IN INDIA. setHours(0,0,0,0) uses the SERVER's timezone,
 * and this renders on Vercel, which is UTC — so midnight-today was 05:30 IST and
 * "Today" quietly dropped every call made before breakfast. Worse, between
 * midnight and 05:30 IST it resolved to 05:30 YESTERDAY, so the page showed a
 * full day of yesterday's calls under the heading "Today".
 *
 * hq_since() in Postgres already does it this way ('Asia/Kolkata'); this is the
 * same boundary, so the Calls page and Platform HQ agree on what "today" is.
 */
function sinceIso(range: string): string | null {
  const now = new Date();
  if (range === "today") {
    // The IST calendar date right now, as a UTC instant: IST is UTC+5:30 with
    // no DST ever, so the offset is a constant and this needs no tz library.
    const IST_OFFSET_MS = 5.5 * 3600_000;
    const istNow = new Date(now.getTime() + IST_OFFSET_MS);
    const istMidnight = Date.UTC(
      istNow.getUTCFullYear(),
      istNow.getUTCMonth(),
      istNow.getUTCDate(),
    );
    return new Date(istMidnight - IST_OFFSET_MS).toISOString();
  }
  if (range === "30d") return new Date(now.getTime() - 30 * 86400_000).toISOString();
  if (range === "all") return null;
  return new Date(now.getTime() - 7 * 86400_000).toISOString(); // 7d default
}

type ContactRow = { id: string; company_id: string; name: string | null; phone: string };

/** Every contact the caller is allowed to see, in pages — no silent truncation. */
async function fetchAllContacts(
  db: { from: (t: string) => any }, // eslint-disable-line @typescript-eslint/no-explicit-any
): Promise<ContactRow[]> {
  const PAGE = 1000;
  const MAX_PAGES = 40; // 40k contacts; past that, names come from contact_id anyway
  const out: ContactRow[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data } = await db
      .from("contacts")
      .select("id, company_id, name, phone")
      .order("id")
      .range(page * PAGE, page * PAGE + PAGE - 1);
    const rows: ContactRow[] = (data as ContactRow[] | null) ?? [];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

export default async function CallsPage({
  searchParams,
}: {
  searchParams: { range?: string };
}) {
  const supabase = await createClient();
  const range = searchParams.range || "7d";
  const since = sinceIso(range);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, company_id")
    .eq("id", user!.id)
    .single<Pick<Profile, "role" | "company_id">>();

  // Super admin sees EVERY company's calls (labelled per company); a regular
  // company admin stays scoped to their own team. Company isolation holds
  // either way — RLS already scopes the anon client, and the super path uses
  // the service role deliberately to read across companies.
  const { data: pa } = await supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user!.id)
    .maybeSingle();
  const isSuper = !!pa;

  if (profile?.role !== "admin" && !isSuper) {
    return <div className="empty">Call logs are available to company admins only.</div>;
  }

  // For the super admin, read cross-company with the service role (bypasses
  // per-company RLS on contacts/companies for name resolution). A regular admin
  // uses their own RLS-scoped client, which returns only their company.
  const db = isSuper ? getServiceSupabase() : supabase;

  let callQuery = db
    .from("call_logs")
    .select(
      "id, company_id, salesperson_id, contact_id, phone, direction, outcome, started_at, created_at, duration_seconds, recording_status, off_crm, notes",
    )
    .order("started_at", { ascending: false, nullsFirst: false })
    .limit(1500);
  // A row with no started_at is still a call that happened. Filtering on
  // started_at alone made 39 of them invisible in every range except "All time"
  // — while the table below happily falls back to created_at to display them.
  // Same coalesce the HQ functions use: judge the row by when the call happened,
  // and by when it arrived only if that is all we have.
  if (since) {
    callQuery = callQuery.or(
      `started_at.gte.${since},and(started_at.is.null,created_at.gte.${since})`,
    );
  }

  const [{ data: calls, error }, { data: people }, { data: companies }, contacts] =
    await Promise.all([
      callQuery.returns<CallRow[]>(),
      db.from("profiles").select("id, full_name").returns<Pick<Profile, "id" | "full_name">[]>(),
      db.from("companies").select("id, name").returns<{ id: string; name: string }[]>(),
      // Paged, because .limit(8000) was a silent cliff: past 8000 contacts the
      // names that resolve become whichever ones Postgres happened to return,
      // with no error and no way to tell from the page.
      fetchAllContacts(db),
    ]);

  const repNames: Record<string, string> = {};
  (people ?? []).forEach((p) => {
    if (p.full_name) repNames[p.id] = p.full_name;
  });

  const companyNames: Record<string, string> = {};
  (companies ?? []).forEach((c) => {
    companyNames[c.id] = c.name;
  });

  // Lead-name resolution maps (by id, and by 10-digit phone tail as fallback).
  //
  // The phone map is keyed "<company>|<tail>", NOT the tail alone. Eleven
  // numbers in this database exist as a contact in more than one company, and
  // the super admin reads contacts with the service role across all of them —
  // so a bare-tail map let a call in company A be labelled with company B's
  // lead name. Contact ids are globally unique, so leadById needs no key
  // change; the CallsBoard still checks contact_id first and only falls back to
  // the phone when the call was never linked to a lead.
  const leadById: Record<string, string> = {};
  const leadByPhone: Record<string, string> = {};
  contacts.forEach((c) => {
    if (!c.name) return;
    leadById[c.id] = c.name;
    leadByPhone[`${c.company_id}|${tail10(c.phone)}`] = c.name;
  });

  return (
    <>
      <h2>Call logs</h2>
      <p className="subtitle">
        Every call by every telecaller — outgoing &amp; incoming, CRM leads and off-CRM numbers —
        streaming in live with names, duration and recordings.
      </p>

      {error && <div className="error">{error.message}</div>}

      <CallsBoard
        initialCalls={calls ?? []}
        repNames={repNames}
        companyNames={companyNames}
        leadById={leadById}
        leadByPhone={leadByPhone}
        isSuper={isSuper}
        range={range}
        sinceIso={since}
        scopeCompanyId={isSuper ? null : profile?.company_id ?? null}
      />
    </>
  );
}
