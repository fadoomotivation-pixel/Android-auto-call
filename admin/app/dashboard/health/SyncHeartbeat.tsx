/**
 * What each phone says about itself.
 *
 * The rest of this page grades a phone by inference — reading the shape of the
 * call_logs rows that arrived and deducing what must be wrong. That is genuinely
 * useful and it is structurally blind to the worst failure: you cannot infer
 * missing rows from the rows that are missing.
 *
 * It missed a real day. A telecaller made about fifteen calls in two hours and
 * the CRM received one. Eleven of the numbers she dialled were her own assigned
 * leads. Nothing looked wrong from the server — her app was still checking in,
 * her device token was fresh, every cron was green — and the dashboard simply
 * showed a rep who had made one call. The founder found it by picking up her
 * phone and comparing it to the screen.
 *
 * So this block is not inference. It is the phone's own report, including the
 * runs where it did nothing and why.
 */
import { createClient } from "@/lib/supabase/server";

type Row = {
  salesperson_id: string;
  full_name: string | null;
  company_name: string | null;
  last_run_at: string | null;
  last_ok_at: string | null;
  outcome: string | null;
  detail: string | null;
  native_seen: number | null;
  backfilled: number | null;
  app_version: string | null;
  device_model: string | null;
  state: string;
  trustworthy: boolean;
};

/** What the state means, and what to actually do about it. */
const STATE: Record<string, { dot: string; label: string; fix: string }> = {
  ok: {
    dot: "🟢", label: "Feeding the CRM",
    fix: "",
  },
  never_reported: {
    dot: "⚪", label: "Never reported",
    fix: "This phone is on a build older than the heartbeat, or the app has not run since it " +
      "was installed. Ask the rep to open Call Pro AI once and check for an update.",
  },
  no_permission: {
    dot: "🔴", label: "Cannot see the phone's calls",
    fix: "Call log permission is switched off, so calls made from the phone's own dialler never " +
      "reach the CRM. Settings → Apps → Call Pro AI → Permissions → Call logs → Allow.",
  },
  stale: {
    dot: "🟠", label: "Stopped reporting",
    fix: "The background sync has not completed for over three hours. Usually the phone's " +
      "battery manager killing it: Settings → Battery → Call Pro AI → Unrestricted.",
  },
  broken: {
    dot: "🔴", label: "The sync is erroring",
    fix: "The app could not read the call log even though permission looks granted. Reinstalling " +
      "usually clears it.",
  },
  no_leads: {
    dot: "⚪", label: "No leads assigned",
    fix: "Nothing to match calls against. Assign this rep some leads.",
  },
};

function ist(iso: string | null): string {
  if (!iso) return "never";
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata", day: "numeric", month: "short",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
}

export async function SyncHeartbeat() {
  const supabase = await createClient();
  const { data } = await supabase.from("v_device_sync_health")
    .select("salesperson_id, full_name, company_name, last_run_at, last_ok_at, outcome, detail, " +
            "native_seen, backfilled, app_version, device_model, state, trustworthy")
    .order("full_name");
  const rows = (data ?? []) as Row[];
  if (rows.length === 0) return null;

  const bad = rows.filter((r) => !r.trustworthy);

  return (
    <section style={{ marginTop: 30 }}>
      <h3 style={{ fontSize: 17, marginBottom: 2 }}>💓 Sync heartbeat</h3>
      <p className="subtitle" style={{ margin: "0 0 12px", fontSize: 12.5, maxWidth: "74ch" }}>
        What each phone reports about itself on every run, including the runs where it did nothing
        and why. Everything above this line is inferred from the calls that <em>arrived</em>; this
        is the only thing that can see the calls that did not.
        {bad.length > 0
          ? <> <strong>{bad.length} of {rows.length}</strong> {bad.length === 1 ? "phone is" : "phones are"} not
            feeding the CRM right now — their numbers cannot be trusted, and the daily review will
            not score them.</>
          : <> All {rows.length} phones are reporting.</>}
      </p>

      {rows.map((r) => {
        const s = STATE[r.state] ?? STATE.never_reported;
        return (
          <div key={r.salesperson_id} className="card"
            style={{ padding: "11px 14px", marginBottom: 8 }}>
            <div style={{ display: "flex", gap: 11, flexWrap: "wrap", alignItems: "baseline" }}>
              <strong style={{ fontSize: 14 }}>{s.dot} {r.full_name ?? "Unnamed"}</strong>
              <span style={{ fontSize: 12.5, color: r.trustworthy ? "#86efac" : "#fca5a5" }}>
                {s.label}
              </span>
              <span style={{ fontSize: 12, color: "var(--muted)", marginLeft: "auto" }}>
                last full scan {ist(r.last_ok_at)}
              </span>
            </div>

            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
              {r.company_name}
              {r.device_model ? ` · ${r.device_model}` : ""}
              {r.app_version ? ` · v${r.app_version}` : ""}
              {r.state === "ok" && (
                <> · saw {r.native_seen ?? 0} calls on the phone, backfilled {r.backfilled ?? 0}</>
              )}
              {r.last_run_at && r.last_run_at !== r.last_ok_at && (
                <> · last tried {ist(r.last_run_at)}</>
              )}
            </div>

            {/* A phone whose live capture is dead but whose safety net is
                carrying everything looks healthy on every other measure. It is
                worth saying out loud before the net misses one too. */}
            {r.state === "ok" && (r.native_seen ?? 0) > 0 &&
              (r.backfilled ?? 0) / (r.native_seen ?? 1) > 0.5 && (
              <div style={{ fontSize: 12.5, color: "#fcd34d", marginTop: 6 }}>
                Most of this phone&apos;s calls are arriving late, through the 15-minute safety net
                rather than as they happen. Live capture is probably not running.
              </div>
            )}

            {s.fix && (
              <div style={{ fontSize: 12.5, marginTop: 6, borderLeft: "3px solid #fbbf24",
                paddingLeft: 10, color: "var(--muted)" }}>
                {s.fix}
                {r.detail ? <div style={{ marginTop: 3, opacity: 0.75 }}>{r.detail}</div> : null}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
