"use client";

/**
 * The leads behind a number on the Velocity page.
 *
 * "178 never called" is a fact a manager cannot act on. It tells them something
 * is wrong and nothing about who to ring, which rep is sitting on them, or how
 * long they have been rotting. Clicking the number should answer all three.
 *
 * IT READS THE SAME ROWS THE CHART DOES. lead_velocity() returns one row per
 * lead with minutes_to_first_call; the edge function buckets those rows into
 * the bands, and so does this. There is deliberately no "give me bucket 3"
 * query — a second definition of what a bucket means is a chart that says 45
 * and a list that shows 47, with no way to tell from the screen which one lied.
 *
 * The band boundaries below are the same array, in the same order, with the
 * same `<=` rule as supabase/functions/sales-velocity/index.ts. If one moves,
 * both move — the comment is in both files.
 */

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ist, daysAgo } from "@/lib/dashboard/format";
import { agedLevel, colorOf, dotOf } from "@/lib/dashboard/health";

/** One row of lead_velocity(). */
type Row = {
  company_name: string | null;
  rep_name: string | null;
  lead_id: string;
  created_at: string;
  minutes_to_first_call: number | null;
  status: string;
  name: string | null;
  phone: string | null;
  last_call_at: string | null;
  next_due_at: string | null;
};

/** Mirrors BUCKETS in sales-velocity/index.ts — same order, same `<=` rule. */
const BANDS = [
  { key: "b5", label: "0-5 min", max: 5 },
  { key: "b30", label: "5-30 min", max: 30 },
  { key: "b120", label: "30 min - 2 hrs", max: 120 },
  { key: "b1440", label: "2 - 24 hrs", max: 1440 },
  { key: "bmore", label: "24 hrs+", max: Number.POSITIVE_INFINITY },
] as const;

export type BandKey = (typeof BANDS)[number]["key"] | "never";

export function bandOf(minutesToFirstCall: number | null): BandKey {
  if (minutesToFirstCall == null) return "never";
  const m = Math.max(0, minutesToFirstCall);
  return (BANDS.find((b) => m <= b.max) ?? BANDS[BANDS.length - 1]).key;
}

export function bandLabel(key: BandKey): string {
  return key === "never" ? "Never called" : BANDS.find((b) => b.key === key)?.label ?? key;
}

export function BandDrill({
  band, days, onClose,
}: {
  band: BandKey;
  days: number;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("lead_velocity", { p_days: days });
    if (error) { setErr(error.message); return; }
    // Filter here, with the same rule the chart used, rather than asking the
    // database for "the leads in this band".
    setRows(((data ?? []) as Row[]).filter((r) => bandOf(r.minutes_to_first_call) === band));
  }, [band, days]);

  useEffect(() => { void load(); }, [load]);

  // Oldest first: the lead that has waited longest is the one to ring.
  const sorted = (rows ?? []).slice().sort((a, b) =>
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  return (
    <div style={{
      marginTop: 12, borderRadius: 14, border: "1px solid rgba(255,255,255,0.14)",
      background: "rgba(255,255,255,0.02)", overflow: "hidden",
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
        padding: "11px 14px", borderBottom: "1px solid rgba(255,255,255,0.08)",
      }}>
        <strong style={{ fontSize: 14.5 }}>
          {bandLabel(band)}
          <span style={{ color: "var(--muted)", fontWeight: 400 }}>
            {rows ? ` · ${sorted.length} lead${sorted.length === 1 ? "" : "s"}` : " · loading…"}
          </span>
        </strong>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>
          Oldest first — the one that has waited longest is the one to ring.
        </span>
        <button onClick={onClose} style={{
          marginLeft: "auto", fontSize: 12, padding: "4px 11px", borderRadius: 7,
          cursor: "pointer", border: "1px solid rgba(255,255,255,0.15)",
          background: "transparent", color: "var(--muted)",
        }}>Close</button>
      </div>

      {err && <div style={{ padding: 14, fontSize: 12.5, color: "#fca5a5" }}>{err}</div>}
      {rows && sorted.length === 0 && (
        <div className="empty" style={{ margin: 14 }}>No leads in this band.</div>
      )}

      {sorted.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--muted)", fontSize: 11.5 }}>
                <th style={th}>Lead</th>
                <th style={th}>Company</th>
                <th style={th}>Rep</th>
                <th style={th}>Age</th>
                <th style={th}>Last call</th>
                <th style={th}>Next action</th>
              </tr>
            </thead>
            <tbody>
              {sorted.slice(0, 100).map((r) => {
                const age = daysAgo(r.created_at);
                const level = agedLevel(age);
                return (
                  <tr key={r.lead_id} style={{ borderTop: "1px solid rgba(255,255,255,0.055)" }}>
                    <td style={td}>
                      <strong>{r.name || r.phone || "Unnamed"}</strong>
                      <span style={{ display: "block", fontSize: 11.5, color: "var(--muted)" }}>
                        {r.phone ?? "no number"} · {r.status}
                      </span>
                    </td>
                    <td style={{ ...td, color: "var(--muted)" }}>{r.company_name ?? "—"}</td>
                    <td style={{ ...td, color: r.rep_name ? "var(--text)" : "#fbbf24" }}>
                      {r.rep_name ?? "unassigned"}
                    </td>
                    <td style={{ ...td, color: colorOf(level), whiteSpace: "nowrap" }}>
                      {dotOf(level)} {age ?? 0}d
                    </td>
                    <td style={{ ...td, color: "var(--muted)", whiteSpace: "nowrap" }}>
                      {r.last_call_at ? ist(r.last_call_at) : "never"}
                    </td>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>
                      {r.next_due_at
                        ? <span style={{ color: "#86efac" }}>{ist(r.next_due_at)}</span>
                        /* The real leak: someone spoke to them and booked nothing. */
                        : <span style={{ color: "#fbbf24" }}>nothing booked</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {sorted.length > 100 && (
            <div style={{ padding: "9px 14px", fontSize: 12, color: "var(--muted)" }}>
              Showing the 100 oldest of {sorted.length}.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const th: React.CSSProperties = { padding: "9px 12px", fontWeight: 600 };
const td: React.CSSProperties = { padding: "9px 12px", verticalAlign: "top" };
