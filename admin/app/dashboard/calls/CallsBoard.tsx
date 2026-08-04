"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { RecordingPlayer } from "../recordings/RecordingPlayer";

/** The slice of call_logs the board renders (kept small on purpose). */
export interface CallRow {
  id: string;
  company_id: string;
  salesperson_id: string;
  contact_id: string | null;
  phone: string;
  direction: string;
  outcome: string | null;
  started_at: string | null;
  created_at: string;
  duration_seconds: number;
  recording_status: string;
  off_crm: boolean;
  notes: string | null;
}

interface Props {
  initialCalls: CallRow[];
  repNames: Record<string, string>;
  companyNames: Record<string, string>;
  leadById: Record<string, string>;
  leadByPhone: Record<string, string>;
  isSuper: boolean;
  range: string;
}

const tail10 = (p: string | null | undefined) => (p ?? "").replace(/\D/g, "").slice(-10);

function fmtDuration(seconds: number) {
  if (!seconds) return "0s";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s.toString().padStart(2, "0")}s`;
  return `${s}s`;
}

export function CallsBoard({
  initialCalls,
  repNames,
  companyNames,
  leadById,
  leadByPhone,
  isSuper,
  range,
}: Props) {
  const router = useRouter();
  const [rows, setRows] = useState<CallRow[]>(initialCalls);
  const [live, setLive] = useState(false);
  const [flash, setFlash] = useState<Set<string>>(new Set());

  // Filters (all client-side except range, which sets the server fetch window).
  const [rep, setRep] = useState("");
  const [dir, setDir] = useState("all"); // all | outgoing | incoming
  const [kind, setKind] = useState("all"); // all | leads | offcrm
  const [company, setCompany] = useState("");
  const [q, setQ] = useState("");

  // Server re-renders (new range / navigation) must reseed the live list.
  useEffect(() => {
    setRows(initialCalls);
  }, [initialCalls]);

  const leadName = (c: CallRow) =>
    (c.contact_id && leadById[c.contact_id]) || leadByPhone[tail10(c.phone)] || null;

  // ---- Real-time: new calls + recording/outcome updates land instantly. ----
  useEffect(() => {
    const supabase = createClient();
    const merge = (r: CallRow, isNew: boolean) => {
      setRows((cur) => {
        const without = cur.filter((x) => x.id !== r.id);
        const next = [r, ...without];
        next.sort((a, b) =>
          (b.started_at ?? b.created_at).localeCompare(a.started_at ?? a.created_at),
        );
        return next.slice(0, 1500);
      });
      if (isNew) {
        setFlash((f) => new Set(f).add(r.id));
        setTimeout(() => {
          setFlash((f) => {
            const n = new Set(f);
            n.delete(r.id);
            return n;
          });
        }, 4000);
      }
    };
    const channel = supabase
      .channel("calls-board")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "call_logs" }, (p) =>
        merge(p.new as CallRow, true),
      )
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "call_logs" }, (p) =>
        merge(p.new as CallRow, false),
      )
      .subscribe((status) => setLive(status === "SUBSCRIBED"));
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const companyOptions = useMemo(() => {
    const ids = new Set(rows.map((r) => r.company_id));
    return [...ids]
      .map((id) => ({ id, name: companyNames[id] || "Unknown company" }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows, companyNames]);

  const repOptions = useMemo(() => {
    const ids = new Set(rows.map((r) => r.salesperson_id));
    return [...ids]
      .map((id) => ({ id, name: repNames[id] || "—" }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows, repNames]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const digits = needle.replace(/\D/g, "");
    return rows.filter((c) => {
      if (rep && c.salesperson_id !== rep) return false;
      if (company && c.company_id !== company) return false;
      if (dir !== "all" && c.direction !== dir) return false;
      if (kind === "leads" && c.off_crm) return false;
      if (kind === "offcrm" && !c.off_crm) return false;
      if (needle) {
        const n = (leadName(c) ?? "").toLowerCase();
        const hit = n.includes(needle) || c.phone.toLowerCase().includes(needle) || (!!digits && tail10(c.phone).includes(digits));
        if (!hit) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, rep, company, dir, kind, q]);

  const totalTalk = filtered.reduce((a, c) => a + (c.duration_seconds || 0), 0);
  const connected = filtered.filter((c) => (c.duration_seconds || 0) > 0).length;
  const withRec = filtered.filter((c) => c.recording_status === "ready").length;
  const offCrm = filtered.filter((c) => c.off_crm).length;

  const selStyle: React.CSSProperties = { minWidth: 0 };

  return (
    <>
      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          alignItems: "center",
          margin: "12px 0",
        }}
      >
        <select value={rep} onChange={(e) => setRep(e.target.value)} style={selStyle}>
          <option value="">All telecallers</option>
          {repOptions.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        {isSuper && (
          <select value={company} onChange={(e) => setCompany(e.target.value)} style={selStyle}>
            <option value="">All companies</option>
            {companyOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
        <select value={dir} onChange={(e) => setDir(e.target.value)} style={selStyle}>
          <option value="all">In &amp; out</option>
          <option value="outgoing">📤 Outgoing</option>
          <option value="incoming">📥 Incoming</option>
        </select>
        <select value={kind} onChange={(e) => setKind(e.target.value)} style={selStyle}>
          <option value="all">Leads &amp; off-CRM</option>
          <option value="leads">CRM leads only</option>
          <option value="offcrm">Off-CRM only</option>
        </select>
        <select
          value={range}
          onChange={(e) => router.push(`/dashboard/calls?range=${e.target.value}`)}
          style={selStyle}
        >
          <option value="today">Today</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="all">All time</option>
        </select>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name or phone"
        />
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            marginLeft: "auto",
            color: live ? "var(--good)" : "var(--muted)",
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              background: live ? "var(--good)" : "var(--muted)",
              boxShadow: live ? "0 0 0 4px rgba(56,193,114,.15)" : "none",
            }}
          />
          {live ? "Live" : "Connecting…"}
        </span>
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", margin: "4px 0 16px" }}>
        <span>
          <strong>{filtered.length}</strong> calls
        </span>
        <span>
          <strong>{connected}</strong> connected
        </span>
        <span>
          <strong>{fmtDuration(totalTalk)}</strong> total talk time
        </span>
        <span>
          <strong>{withRec}</strong> with recording
        </span>
        <span>
          <strong>{offCrm}</strong> off-CRM
        </span>
      </div>

      {/* Outgoing without a single inbound call isn't a quiet week — it's the
          signature of a phone whose call-log sync has stopped, and the answer
          lives on Phone Health, not here. */}
      {rows.length >= 10 && rows.every((c) => c.direction !== "incoming") && (
        <div
          style={{
            display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap",
            border: "1px solid rgba(245,158,11,0.35)", background: "rgba(245,158,11,0.08)",
            borderRadius: 14, padding: "10px 14px", marginBottom: 14, fontSize: 13,
          }}
        >
          <span>
            📥 <strong>Zero incoming calls</strong> in this window. Outgoing calls are logged by the app itself;
            incoming and missed calls only arrive if the phone&apos;s call-log sync is running.
          </span>
          <a href="/dashboard/health" style={{ marginLeft: "auto", color: "var(--accent)", whiteSpace: "nowrap" }}>
            Check Phone Health →
          </a>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="empty">No calls match these filters.</div>
      ) : (
        <div className="table-responsive">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Telecaller</th>
                {isSuper && <th>Company</th>}
                <th>Number</th>
                <th>Dir</th>
                <th>Outcome</th>
                <th>Duration</th>
                <th>Recording</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const name = leadName(c);
                return (
                  <tr
                    key={c.id}
                    style={
                      flash.has(c.id)
                        ? { animation: "callFlash 4s ease-out", background: "rgba(56,193,114,.10)" }
                        : undefined
                    }
                  >
                    <td style={{ whiteSpace: "nowrap" }}>
                      {new Date(c.started_at ?? c.created_at).toLocaleString("en-IN", {
                        timeZone: "Asia/Kolkata",
                      })}
                    </td>
                    <td>{repNames[c.salesperson_id] || "—"}</td>
                    {isSuper && (
                      <td style={{ fontSize: 12, opacity: 0.85 }}>
                        {companyNames[c.company_id] || "—"}
                      </td>
                    )}
                    <td>
                      <strong>{name || (c.off_crm ? "Off-CRM number" : "Unknown")}</strong>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>{c.phone}</div>
                      {c.off_crm && (
                        <span
                          className="badge"
                          style={{ background: "var(--border)", color: "var(--muted)", fontSize: 11 }}
                        >
                          Off-CRM
                        </span>
                      )}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {c.direction === "incoming" ? "📥 In" : "📤 Out"}
                    </td>
                    <td>
                      {c.outcome ? <span className={`badge ${c.outcome}`}>{c.outcome}</span> : "—"}
                    </td>
                    <td>{fmtDuration(c.duration_seconds)}</td>
                    <td>
                      {c.recording_status === "ready" ? (
                        <RecordingPlayer callId={c.id} canDelete={false} />
                      ) : (
                        <span style={{ opacity: 0.5 }}>—</span>
                      )}
                    </td>
                    <td>{c.notes || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <style>{`
        @keyframes callFlash {
          0% { background: rgba(56,193,114,.28); }
          100% { background: transparent; }
        }
      `}</style>
    </>
  );
}
