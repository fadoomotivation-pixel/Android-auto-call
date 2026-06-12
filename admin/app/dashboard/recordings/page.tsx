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

export default async function RecordingsPage() {
  const supabase = await createClient();

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
  const [{ data: calls, error }, { data: people }] = await Promise.all([
    supabase
      .from("call_logs")
      .select("*")
      .eq("recording_status", "ready")
      .order("created_at", { ascending: false })
      .limit(500)
      .returns<CallLog[]>(),
    supabase.from("profiles").select("id, full_name").returns<Profile[]>(),
  ]);

  const nameById = new Map((people ?? []).map((p) => [p.id, p.full_name]));
  const rows = calls ?? [];

  return (
    <>
      <h2>Call recordings</h2>
      <p className="subtitle">
        Recorded cloud calls (latest 500). Telecallers see their own; admins see the whole company.
        Recordings auto-delete after 30 days.
      </p>

      {company && <RecordingSetup companyId={company.id} enabled={company.recording_enabled} />}

      {error && <div className="error">{error.message}</div>}

      {rows.length === 0 ? (
        <div className="empty">No recordings yet.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Salesperson</th>
              <th>Phone</th>
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
                <td>{c.phone}</td>
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
      )}
    </>
  );
}
