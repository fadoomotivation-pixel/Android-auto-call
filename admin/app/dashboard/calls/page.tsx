import { createClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import type { Profile } from "@/lib/types";
import { CallsBoard, type CallRow } from "./CallsBoard";

const tail10 = (p: string | null | undefined) => (p ?? "").replace(/\D/g, "").slice(-10);

/** since-timestamp for the range filter (default: last 7 days). */
function sinceIso(range: string): string | null {
  const now = new Date();
  if (range === "today") {
    now.setHours(0, 0, 0, 0);
    return now.toISOString();
  }
  if (range === "30d") return new Date(now.getTime() - 30 * 86400_000).toISOString();
  if (range === "all") return null;
  return new Date(now.getTime() - 7 * 86400_000).toISOString(); // 7d default
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
    .select("role")
    .eq("id", user!.id)
    .single<Pick<Profile, "role">>();

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
  if (since) callQuery = callQuery.gte("started_at", since);

  const [{ data: calls, error }, { data: people }, { data: companies }, { data: contacts }] =
    await Promise.all([
      callQuery.returns<CallRow[]>(),
      db.from("profiles").select("id, full_name").returns<Pick<Profile, "id" | "full_name">[]>(),
      db.from("companies").select("id, name").returns<{ id: string; name: string }[]>(),
      db
        .from("contacts")
        .select("id, name, phone")
        .limit(8000)
        .returns<{ id: string; name: string | null; phone: string }[]>(),
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
  const leadById: Record<string, string> = {};
  const leadByPhone: Record<string, string> = {};
  (contacts ?? []).forEach((c) => {
    if (!c.name) return;
    leadById[c.id] = c.name;
    leadByPhone[tail10(c.phone)] = c.name;
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
      />
    </>
  );
}
