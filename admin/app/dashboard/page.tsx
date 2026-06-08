import { createClient } from "@/lib/supabase/server";

function fmtDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
}

export default async function OverviewPage() {
  const supabase = await createClient();

  const [{ count: contactCount }, { count: callCount }, { count: salesCount }, { data: talk }] =
    await Promise.all([
      supabase.from("contacts").select("*", { count: "exact", head: true }),
      supabase.from("call_logs").select("*", { count: "exact", head: true }),
      supabase
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .eq("role", "salesperson"),
      supabase.from("call_logs").select("duration_seconds"),
    ]);

  const totalTalk = (talk ?? []).reduce(
    (sum, r: { duration_seconds: number }) => sum + (r.duration_seconds || 0),
    0,
  );

  return (
    <>
      <h2>Overview</h2>
      <p className="subtitle">Everything your team has stored on the cloud.</p>

      <div className="cards">
        <div className="card">
          <div className="label">Salespeople</div>
          <div className="value">{salesCount ?? 0}</div>
        </div>
        <div className="card">
          <div className="label">Contacts</div>
          <div className="value">{contactCount ?? 0}</div>
        </div>
        <div className="card">
          <div className="label">Calls logged</div>
          <div className="value">{callCount ?? 0}</div>
        </div>
        <div className="card">
          <div className="label">Total talk time</div>
          <div className="value">{fmtDuration(totalTalk)}</div>
        </div>
      </div>

      <p className="subtitle">
        Use the left menu to drill into salespeople productivity, the imported
        contact lists, and the full call history.
      </p>
    </>
  );
}
