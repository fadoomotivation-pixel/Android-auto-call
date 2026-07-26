"use client";

import { useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { createClient } from "@/lib/supabase/client";

interface Policy { company_id: string; enabled: boolean; reassign_after_min: number; notify_admin: boolean }
interface Company { id: string; name: string | null }
interface Event {
  id: string; company_id: string; action: string; waited_min: number | null;
  detail: string | null; created_at: string;
}

/**
 * Auto-Rescue control — the human's hand on an autonomous action.
 *
 * The system can reassign a lead nobody called. That is a real action on real
 * customer data, so the owner decides: off by default, their own threshold,
 * and every move it makes is listed below for review.
 */
export function AutoRescue() {
  const supabase = createClient();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [policies, setPolicies] = useState<Record<string, Policy>>({});
  const [events, setEvents] = useState<Event[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [{ data: cos }, { data: pol }, { data: ev }] = await Promise.all([
      supabase.from("companies").select("id, name").order("name").returns<Company[]>(),
      supabase.from("sla_policy").select("company_id, enabled, reassign_after_min, notify_admin").returns<Policy[]>(),
      supabase.from("sla_events").select("id, company_id, action, waited_min, detail, created_at")
        .order("created_at", { ascending: false }).limit(8).returns<Event[]>(),
    ]);
    setCompanies(cos ?? []);
    const map: Record<string, Policy> = {};
    for (const p of pol ?? []) map[p.company_id] = p;
    setPolicies(map);
    setEvents(ev ?? []);
  }, [supabase]);

  useEffect(() => { void load(); }, [load]);

  async function save(companyId: string, patch: Partial<Policy>) {
    setBusy(companyId); setMsg(null);
    const cur = policies[companyId];
    const row = {
      company_id: companyId,
      enabled: patch.enabled ?? cur?.enabled ?? false,
      reassign_after_min: patch.reassign_after_min ?? cur?.reassign_after_min ?? 120,
      notify_admin: patch.notify_admin ?? cur?.notify_admin ?? true,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("sla_policy").upsert(row, { onConflict: "company_id" });
    setBusy(null);
    if (error) { setMsg(error.message); return; }
    setPolicies((p) => ({ ...p, [companyId]: row }));
  }

  const card: CSSProperties = { background: "var(--panel-grad, var(--panel))", border: "1px solid rgba(16,185,129,0.25)", borderRadius: 18, padding: 22 };
  const row: CSSProperties = { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "10px 0", borderTop: "1px solid rgba(255,255,255,0.06)" };

  return (
    <div style={card}>
      <strong style={{ color: "#fff", fontSize: 15 }}>🛟 Auto-Rescue</strong>
      <p className="subtitle" style={{ margin: "2px 0 8px" }}>
        Reminders alone don&apos;t save a lead — if nobody calls, it just dies quietly. When this is on, a lead
        still uncalled after your limit is <strong>handed to another telecaller</strong> and the manager is told.
        It never contacts the customer itself; it only makes sure a human does. Off until you switch it on, and
        every move it makes is listed below.
      </p>

      {msg && <div className="error" style={{ marginBottom: 8 }}>{msg}</div>}

      {companies.length === 0 && <div className="subtitle">No companies visible.</div>}

      {companies.map((c) => {
        const p = policies[c.id];
        const on = !!p?.enabled;
        return (
          <div key={c.id} style={row}>
            <span style={{ color: "#fff", fontWeight: 600, minWidth: 150 }}>{c.name ?? "Company"}</span>
            <button
              onClick={() => save(c.id, { enabled: !on })}
              disabled={busy === c.id}
              style={{ padding: "6px 14px", borderRadius: 999, cursor: "pointer", fontSize: 12.5, fontWeight: 700,
                border: `1px solid ${on ? "#10b981" : "var(--border)"}`,
                background: on ? "rgba(16,185,129,0.15)" : "rgba(255,255,255,0.03)",
                color: on ? "#10b981" : "var(--muted)" }}>
              {busy === c.id ? "…" : on ? "ON" : "OFF"}
            </button>
            <span style={{ fontSize: 12.5, color: "var(--muted)" }}>Hand over after</span>
            <select
              value={p?.reassign_after_min ?? 120}
              onChange={(e) => save(c.id, { reassign_after_min: Number(e.target.value) })}
              style={{ width: "auto", padding: "6px 10px", fontSize: 12.5 }}>
              {[30, 60, 120, 240, 480].map((m) => (
                <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60} hr`}</option>
              ))}
            </select>
            <label style={{ fontSize: 12.5, color: "var(--muted)", display: "inline-flex", gap: 6, alignItems: "center" }}>
              <input type="checkbox" checked={p?.notify_admin ?? true}
                onChange={(e) => save(c.id, { notify_admin: e.target.checked })}
                style={{ width: "auto" }} />
              tell the manager
            </label>
          </div>
        );
      })}

      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          What it did
        </div>
        {events.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 8 }}>
            Nothing yet — it only acts on leads that pass your limit while it&apos;s switched on.
          </div>
        ) : (
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
            {events.map((e) => (
              <div key={e.id} style={{ display: "flex", gap: 10, alignItems: "baseline", fontSize: 13 }}>
                <span style={{ color: e.action === "reassigned" ? "#10b981" : e.action === "skipped" ? "#f59e0b" : "var(--muted)", fontWeight: 600, minWidth: 96 }}>
                  {e.action.replace("_", " ")}
                </span>
                <span style={{ color: "var(--text)" }}>{e.detail}</span>
                <span style={{ marginLeft: "auto", color: "var(--muted)", fontSize: 12, whiteSpace: "nowrap" }}>
                  {new Date(e.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
