import { createClient } from "@/lib/supabase/server";
import type { Company, Profile, SalespersonStats } from "@/lib/types";
import { CompanyPicker } from "../whatsapp/CompanyPicker";
import { InviteCard } from "./InviteCard";
import { MemberToggle } from "./MemberToggle";

type Member = Pick<Profile, "id" | "full_name" | "is_active">;

function fmtDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

export default async function SalespeoplePage({
  searchParams,
}: {
  searchParams: { company?: string };
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // The super admin serves EVERY company equally — they pick which team to view
  // (invite code, stats and members all follow that pick). A regular admin is
  // scoped to their own company by RLS. Previously this page did
  // `companies … limit(1)`, which showed the super admin ONE arbitrary company's
  // join code and all companies' reps mixed together — the bug this fixes.
  const [{ data: prof }, { data: pa }] = await Promise.all([
    supabase.from("profiles").select("company_id").eq("id", user.id).maybeSingle<{ company_id: string | null }>(),
    supabase.from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle(),
  ]);
  const isSuper = !!pa;

  const { data: companies } = isSuper
    ? await supabase.from("companies").select("id, name").order("name").returns<{ id: string; name: string | null }[]>()
    : { data: null };
  const companyId = isSuper
    ? (searchParams.company ?? companies?.[0]?.id ?? null)
    : (prof?.company_id ?? null);

  const [{ data: stats, error }, { data: company }, { data: members }] = await Promise.all([
    companyId
      ? supabase
          .from("v_salesperson_stats")
          .select("*")
          .eq("company_id", companyId)
          .order("total_calls", { ascending: false })
          .returns<SalespersonStats[]>()
      : Promise.resolve({ data: [] as SalespersonStats[], error: null }),
    companyId
      ? supabase.from("companies").select("*").eq("id", companyId).maybeSingle<Company>()
      : Promise.resolve({ data: null }),
    companyId
      ? supabase
          .from("profiles")
          .select("id, full_name, is_active")
          .eq("role", "salesperson")
          .eq("company_id", companyId)
          .returns<Member[]>()
      : Promise.resolve({ data: [] as Member[] }),
  ]);

  const rows = stats ?? [];
  const memberList = members ?? [];
  const activeById = new Map(memberList.map((m) => [m.id, m.is_active]));

  return (
    <>
      <h2>Salespeople</h2>
      <p className="subtitle">Invite your team and track per-person productivity.</p>

      {isSuper && <CompanyPicker companies={companies ?? []} selected={companyId} />}

      <InviteCard code={company?.join_code ?? null} />

      {error && <div className="error">{error.message}</div>}

      {rows.length === 0 ? (
        <div className="empty">No salespeople yet. Share the invite code above.</div>
      ) : (
        <div className="table-responsive">
<table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Contacts</th>
              <th>Calls</th>
              <th>Connected</th>
              <th>No answer</th>
              <th>Talk time</th>
              <th>Last call</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const active = activeById.get(r.salesperson_id) ?? true;
              return (
                <tr key={r.salesperson_id}>
                  <td>{r.full_name || "—"}</td>
                  <td>{r.total_contacts}</td>
                  <td>{r.total_calls}</td>
                  <td>{r.connected_calls}</td>
                  <td>{r.no_answer_calls}</td>
                  <td>{fmtDuration(r.total_talk_seconds)}</td>
                  <td>{r.last_call_at ? new Date(r.last_call_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "—"}</td>
                  <td>
                    <span className={`badge ${active ? "connected" : "dnc"}`} style={{ marginRight: 8 }}>
                      {active ? "active" : "inactive"}
                    </span>
                    <MemberToggle userId={r.salesperson_id} active={active} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
</div>
      )}
    </>
  );
}
