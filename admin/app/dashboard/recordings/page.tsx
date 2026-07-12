import { createClient } from "@/lib/supabase/server";
import type { CallLog, Profile } from "@/lib/types";
import { CallSummary } from "./CallSummary";
import { RecordingPlayer } from "./RecordingPlayer";
import { RecordingSetup } from "./RecordingSetup";

function fmt(seconds: number | null) {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

const tail10 = (p: string | null | undefined) => (p ?? "").replace(/\D/g, "").slice(-10);

export default async function RecordingsPage({
  searchParams,
}: {
  searchParams: { rep?: string; q?: string };
}) {
  const supabase = await createClient();
  const repFilter = searchParams.rep || "";
  const q = (searchParams.q || "").trim().toLowerCase();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: me }, { data: pa }] = await Promise.all([
    supabase.from("profiles").select("role, company_id").eq("id", user!.id).maybeSingle<{ role: string; company_id: string | null }>(),
    supabase.from("platform_admins").select("user_id").eq("user_id", user!.id).maybeSingle(),
  ]);
  // Only the super admin may delete recordings (companies/telecallers can listen).
  const canDelete = !!pa;
  const canSummarize = me?.role === "admin" || !!pa;

  // Company admins get a recording on/off switch for their company.
  let company: { id: string; recording_enabled: boolean } | null = null;
  if (me?.role === "admin" && me.company_id) {
    const { data } = await supabase
      .from("companies").select("id, recording_enabled").eq("id", me.company_id)
      .maybeSingle<{ id: string; recording_enabled: boolean }>();
    company = data;
  }

  // RLS scopes this automatically: telecaller = own, admin = company, super = all.
  let recQuery = supabase
    .from("call_logs")
    .select("*")
    .eq("recording_status", "ready")
    .order("created_at", { ascending: false })
    .limit(500);
  if (repFilter) recQuery = recQuery.eq("salesperson_id", repFilter);

  const [{ data: calls, error }, { data: people }, { data: contacts }] = await Promise.all([
    recQuery.returns<CallLog[]>(),
    supabase.from("profiles").select("id, full_name").returns<Profile[]>(),
    supabase.from("contacts").select("id, name, phone").limit(5000).returns<{ id: string; name: string | null; phone: string }[]>(),
  ]);

  const nameById = new Map((people ?? []).map((p) => [p.id, p.full_name]));
  const leadById = new Map((contacts ?? []).map((c) => [c.id, c.name]));
  const leadByPhone = new Map(
    (contacts ?? []).filter((c) => c.name).map((c) => [tail10(c.phone), c.name] as const),
  );
  const leadName = (c: CallLog) =>
    (c.contact_id && leadById.get(c.contact_id)) || leadByPhone.get(tail10(c.phone)) || null;

  let rows = calls ?? [];
  if (q) {
    rows = rows.filter((c) => {
      const n = (leadName(c) ?? "").toLowerCase();
      return n.includes(q) || c.phone.includes(q) || tail10(c.phone).includes(q.replace(/\D/g, ""));
    });
  }
  const totalRecSecs = rows.reduce((a, c) => a + (c.recording_seconds || 0), 0);

  return (
    <>
      <h2>Call recordings</h2>
      <p className="subtitle">
        Recorded cloud calls (latest 500). Telecallers see their own; admins see the whole company.
        Recordings auto-delete after 30 days.
      </p>

      {company && <RecordingSetup companyId={company.id} enabled={company.recording_enabled} />}

      <form method="get" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", margin: "12px 0" }}>
        <select name="rep" defaultValue={repFilter}>
          <option value="">All telecallers</option>
          {(people ?? []).map((p) => (
            <option key={p.id} value={p.id}>{p.full_name}</option>
          ))}
        </select>
        <input name="q" defaultValue={searchParams.q || ""} placeholder="Search lead name or phone" />
        <button type="submit">Apply</button>
      </form>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", margin: "4px 0 16px" }}>
        <span><strong>{rows.length}</strong> recordings</span>
        <span><strong>{fmt(totalRecSecs)}</strong> total audio</span>
      </div>

      {error && <div className="error">{error.message}</div>}

      {rows.length === 0 ? (
        <div className="empty">No recordings yet.</div>
      ) : (
        <div className="table-responsive">
<table>
          <thead>
            <tr>
              <th>When</th>
              <th>Telecaller</th>
              <th>Lead</th>
              <th>Length</th>
              <th>Source</th>
              <th>Recording</th>
              {canSummarize && <th>AI summary</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td>{new Date(c.started_at ?? c.created_at).toLocaleString()}</td>
                <td>{nameById.get(c.salesperson_id) || "—"}</td>
                <td>
                  <strong>{leadName(c) || "Unknown"}</strong>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>{c.phone}</div>
                </td>
                <td>{fmt(c.recording_seconds)}</td>
                <td>{c.recording_source === "sim" ? "SIM" : "Cloud"}</td>
                <td>
                  <RecordingPlayer callId={c.id} canDelete={canDelete} />
                </td>
                {canSummarize && (
                  <td>
                    <CallSummary callId={c.id} initial={c.summary} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
</div>
      )}
    </>
  );
}

