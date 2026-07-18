import type { CSSProperties } from "react";
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

function fmtLong(seconds: number) {
  if (seconds >= 3600) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  return fmt(seconds);
}

const tail10 = (p: string | null | undefined) => (p ?? "").replace(/\D/g, "").slice(-10);

export default async function RecordingsPage({
  searchParams,
}: {
  searchParams: { rep?: string; q?: string; dir?: string; days?: string; co?: string };
}) {
  const supabase = await createClient();
  const repFilter = searchParams.rep || "";
  const q = (searchParams.q || "").trim().toLowerCase();
  const dirFilter = searchParams.dir === "incoming" || searchParams.dir === "outgoing" ? searchParams.dir : "";
  const days = [1, 7, 30].includes(Number(searchParams.days)) ? Number(searchParams.days) : 0;
  const coFilter = searchParams.co || "";

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: me }, { data: pa }] = await Promise.all([
    supabase.from("profiles").select("role, company_id").eq("id", user!.id).maybeSingle<{ role: string; company_id: string | null }>(),
    supabase.from("platform_admins").select("user_id").eq("user_id", user!.id).maybeSingle(),
  ]);
  // Only the super admin may delete recordings (companies/telecallers can listen).
  const isSuper = !!pa;
  const canDelete = isSuper;
  const canSummarize = me?.role === "admin" || isSuper;

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
  if (dirFilter) recQuery = recQuery.eq("direction", dirFilter);
  if (coFilter) recQuery = recQuery.eq("company_id", coFilter);
  if (days) recQuery = recQuery.gte("created_at", new Date(Date.now() - days * 864e5).toISOString());

  const [{ data: calls, error }, { data: people }, { data: contacts }, { data: companies }] = await Promise.all([
    recQuery.returns<CallLog[]>(),
    supabase.from("profiles").select("id, full_name, company_id").returns<(Profile & { company_id: string | null })[]>(),
    supabase.from("contacts").select("id, name, phone").limit(5000).returns<{ id: string; name: string | null; phone: string }[]>(),
    supabase.from("companies").select("id, name").returns<{ id: string; name: string }[]>(),
  ]);

  const nameById = new Map((people ?? []).map((p) => [p.id, p.full_name]));
  const companyById = new Map((companies ?? []).map((c) => [c.id, c.name]));
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
  const incomingCount = rows.filter((c) => c.direction === "incoming").length;

  // Per-telecaller activity rollup for the CURRENT filter — how the super admin
  // tracks who is actually talking. Click a card to drill into that rep.
  type Roll = { name: string; company: string; recs: number; secs: number };
  const rollup = new Map<string, Roll>();
  for (const c of rows) {
    const r = rollup.get(c.salesperson_id) ?? {
      name: nameById.get(c.salesperson_id) || "Unknown",
      company: companyById.get(c.company_id) || "",
      recs: 0,
      secs: 0,
    };
    r.recs += 1;
    r.secs += c.recording_seconds || 0;
    rollup.set(c.salesperson_id, r);
  }
  const repCards = [...rollup.entries()].sort((a, b) => b[1].recs - a[1].recs);

  // Keep the other filters when a card / filter link changes one dimension.
  const linkWith = (patch: Record<string, string>) => {
    const p = new URLSearchParams();
    if (repFilter) p.set("rep", repFilter);
    if (searchParams.q) p.set("q", searchParams.q);
    if (dirFilter) p.set("dir", dirFilter);
    if (days) p.set("days", String(days));
    if (coFilter) p.set("co", coFilter);
    for (const [k, v] of Object.entries(patch)) v ? p.set(k, v) : p.delete(k);
    const s = p.toString();
    return s ? `?${s}` : "?";
  };

  const chip = (active: boolean): CSSProperties => ({
    padding: "4px 12px",
    borderRadius: 999,
    fontSize: 13,
    textDecoration: "none",
    border: "1px solid var(--border, #d8dce2)",
    background: active ? "var(--accent, #4353B8)" : "transparent",
    color: active ? "#fff" : "inherit",
  });

  return (
    <>
      <h2>Call recordings</h2>
      <p className="subtitle">
        Every recorded lead call — outgoing dials and incoming call-backs — with its AI summary.
        Telecallers hear their own; admins the whole company{isSuper ? "; you see every company" : ""}.
      </p>

      {company && <RecordingSetup companyId={company.id} enabled={company.recording_enabled} />}

      {/* Filter rail: date + direction as one-tap chips, rep/company/search as a form. */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", margin: "12px 0 4px" }}>
        <a href={linkWith({ days: "" })} style={chip(!days)}>All time</a>
        <a href={linkWith({ days: "1" })} style={chip(days === 1)}>Today</a>
        <a href={linkWith({ days: "7" })} style={chip(days === 7)}>7 days</a>
        <a href={linkWith({ days: "30" })} style={chip(days === 30)}>30 days</a>
        <span style={{ opacity: 0.35 }}>|</span>
        <a href={linkWith({ dir: "" })} style={chip(!dirFilter)}>All calls</a>
        <a href={linkWith({ dir: "outgoing" })} style={chip(dirFilter === "outgoing")}>↗ Outgoing</a>
        <a href={linkWith({ dir: "incoming" })} style={chip(dirFilter === "incoming")}>↙ Incoming</a>
      </div>

      <form method="get" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", margin: "8px 0" }}>
        {/* Preserve chip filters across form submits. */}
        {dirFilter && <input type="hidden" name="dir" value={dirFilter} />}
        {days ? <input type="hidden" name="days" value={days} /> : null}
        {isSuper && (
          <select name="co" defaultValue={coFilter}>
            <option value="">All companies</option>
            {(companies ?? []).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
        <select name="rep" defaultValue={repFilter}>
          <option value="">All telecallers</option>
          {(people ?? [])
            .filter((p) => !coFilter || p.company_id === coFilter)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}{isSuper && p.company_id ? ` · ${companyById.get(p.company_id) ?? ""}` : ""}
              </option>
            ))}
        </select>
        <input name="q" defaultValue={searchParams.q || ""} placeholder="Search lead name or phone" />
        <button type="submit">Apply</button>
      </form>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", margin: "4px 0 12px" }}>
        <span><strong>{rows.length}</strong> recordings</span>
        <span><strong>{fmtLong(totalRecSecs)}</strong> total audio</span>
        <span><strong>{incomingCount}</strong> incoming call-backs</span>
      </div>

      {/* Telecaller activity rollup — who is actually on the phone. */}
      {repCards.length > 1 && !repFilter && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "0 0 16px" }}>
          {repCards.map(([id, r]) => (
            <a
              key={id}
              href={linkWith({ rep: id })}
              style={{
                textDecoration: "none",
                color: "inherit",
                border: "1px solid var(--border, #d8dce2)",
                borderRadius: 12,
                padding: "10px 14px",
                minWidth: 150,
              }}
            >
              <div style={{ fontWeight: 600 }}>{r.name}</div>
              {isSuper && r.company && <div style={{ fontSize: 12, opacity: 0.6 }}>{r.company}</div>}
              <div style={{ fontSize: 13, marginTop: 4 }}>
                <strong>{r.recs}</strong> rec · <strong>{fmtLong(r.secs)}</strong> talk
              </div>
            </a>
          ))}
        </div>
      )}
      {repFilter && (
        <p style={{ margin: "0 0 12px" }}>
          Showing <strong>{nameById.get(repFilter) || "one telecaller"}</strong> ·{" "}
          <a href={linkWith({ rep: "" })}>show everyone</a>
        </p>
      )}

      {error && <div className="error">{error.message}</div>}

      {rows.length === 0 ? (
        <div className="empty">No recordings match these filters yet.</div>
      ) : (
        <div className="table-responsive">
          <table>
            <thead>
              <tr>
                <th>When</th>
                {isSuper && <th>Company</th>}
                <th>Telecaller</th>
                <th>Lead</th>
                <th>Dir</th>
                <th>Length</th>
                <th>Recording</th>
                {canSummarize && <th>AI summary</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td>{new Date(c.started_at ?? c.created_at).toLocaleString()}</td>
                  {isSuper && <td>{companyById.get(c.company_id) || "—"}</td>}
                  <td>{nameById.get(c.salesperson_id) || "—"}</td>
                  <td>
                    <strong>{leadName(c) || "Unknown"}</strong>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>{c.phone}</div>
                  </td>
                  <td title={c.direction === "incoming" ? "Lead called the telecaller" : "Telecaller dialled the lead"}>
                    {c.direction === "incoming" ? "↙ In" : "↗ Out"}
                  </td>
                  <td>{fmt(c.recording_seconds)}</td>
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
