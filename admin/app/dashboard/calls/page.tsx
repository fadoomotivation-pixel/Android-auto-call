import { createClient } from "@/lib/supabase/server";
import type { CallLog, Profile } from "@/lib/types";
import { RecordingPlayer } from "../recordings/RecordingPlayer";

function fmtDuration(seconds: number) {
  if (!seconds) return "0s";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s.toString().padStart(2, "0")}s`;
  return `${s}s`;
}

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
  searchParams: { rep?: string; range?: string; q?: string };
}) {
  const supabase = await createClient();
  const rep = searchParams.rep || "";
  const range = searchParams.range || "7d";
  const q = (searchParams.q || "").trim().toLowerCase();
  const since = sinceIso(range);

  // RLS scopes rows automatically: admin = own company, super admin = all.
  let query = supabase
    .from("call_logs")
    .select("*")
    .order("started_at", { ascending: false, nullsFirst: false })
    .limit(1000);
  if (since) query = query.gte("started_at", since);
  if (rep) query = query.eq("salesperson_id", rep);

  const [{ data: calls, error }, { data: people }, { data: contacts }] = await Promise.all([
    query.returns<CallLog[]>(),
    supabase.from("profiles").select("id, full_name").returns<Profile[]>(),
    supabase.from("contacts").select("id, name, phone").limit(5000).returns<{ id: string; name: string | null; phone: string }[]>(),
  ]);

  const repName = new Map((people ?? []).map((p) => [p.id, p.full_name]));
  // Lead name: by contact_id first, by 10-digit phone tail as fallback.
  const leadById = new Map((contacts ?? []).map((c) => [c.id, c.name]));
  const leadByPhone = new Map(
    (contacts ?? [])
      .filter((c) => c.name)
      .map((c) => [tail10(c.phone), c.name] as const),
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

  // Summary strip — the numbers a boss actually asks for.
  const totalTalk = rows.reduce((a, c) => a + (c.duration_seconds || 0), 0);
  const connected = rows.filter((c) => (c.duration_seconds || 0) > 0).length;
  const withRec = rows.filter((c) => c.recording_status === "ready").length;

  return (
    <>
      <h2>Call logs</h2>
      <p className="subtitle">
        Every call by every telecaller — lead name, duration and the recording, in one place.
      </p>

      <form method="get" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", margin: "12px 0" }}>
        <select name="rep" defaultValue={rep}>
          <option value="">All telecallers</option>
          {(people ?? []).map((p) => (
            <option key={p.id} value={p.id}>{p.full_name}</option>
          ))}
        </select>
        <select name="range" defaultValue={range}>
          <option value="today">Today</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="all">All time</option>
        </select>
        <input name="q" defaultValue={searchParams.q || ""} placeholder="Search name or phone" />
        <button type="submit">Apply</button>
      </form>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", margin: "4px 0 16px" }}>
        <span><strong>{rows.length}</strong> calls</span>
        <span><strong>{connected}</strong> connected</span>
        <span><strong>{fmtDuration(totalTalk)}</strong> total talk time</span>
        <span><strong>{withRec}</strong> with recording</span>
      </div>

      {error && <div className="error">{error.message}</div>}

      {rows.length === 0 ? (
        <div className="empty">No calls in this range.</div>
      ) : (
        <div className="table-responsive">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Telecaller</th>
                <th>Lead</th>
                <th>Dir</th>
                <th>Outcome</th>
                <th>Duration</th>
                <th>Recording</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td>{new Date(c.started_at ?? c.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</td>
                  <td>{repName.get(c.salesperson_id) || "—"}</td>
                  <td>
                    <strong>{leadName(c) || "Unknown"}</strong>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>{c.phone}</div>
                  </td>
                  <td>{c.direction === "incoming" ? "📥 In" : "📤 Out"}</td>
                  <td>{c.outcome ? <span className={`badge ${c.outcome}`}>{c.outcome}</span> : "—"}</td>
                  <td>{fmtDuration(c.duration_seconds)}</td>
                  <td>
                    {c.recording_status === "ready"
                      ? <RecordingPlayer callId={c.id} canDelete={false} />
                      : <span style={{ opacity: 0.5 }}>—</span>}
                  </td>
                  <td>{c.notes || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
