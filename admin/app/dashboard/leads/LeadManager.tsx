"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ImportLeads } from "./ImportLeads";

type Sp = { id: string; full_name: string | null; territory: string | null };
type Lead = {
  id: string;
  name: string | null;
  phone: string;
  company_name: string | null;
  status: string;
  salesperson_id: string | null;
  budget: string | null;
  territory: string | null;
  created_at: string;
};

const PAGE = 50;

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

export function LeadManager({ companyId, salespeople }: { companyId: string; salespeople: Sp[] }) {
  const supabase = createClient();
  const nameOf = (id: string | null) => salespeople.find((s) => s.id === id)?.full_name || (id ? "—" : "Unassigned");

  const [tab, setTab] = useState<"unassigned" | "assigned">("unassigned");
  const [agentFilter, setAgentFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assignTo, setAssignTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const [stats, setStats] = useState({ total: 0, unassigned: 0, assigned: 0 });
  const [agentCounts, setAgentCounts] = useState<Record<string, number>>({});

  const safe = (s: string) => s.trim().replace(/[,%()]/g, "");

  const buildQuery = useCallback(() => {
    let q = supabase
      .from("contacts")
      .select("id, name, phone, company_name, status, salesperson_id, budget, territory, created_at")
      .order("created_at", { ascending: false });
    if (tab === "unassigned") {
      q = q.is("salesperson_id", null);
    } else {
      q = q.not("salesperson_id", "is", null);
      if (agentFilter) q = q.eq("salesperson_id", agentFilter);
    }
    const s = safe(search);
    if (s) q = q.or(`name.ilike.%${s}%,phone.ilike.%${s}%`);
    return q;
  }, [supabase, tab, agentFilter, search]);

  const load = useCallback(
    async (reset: boolean) => {
      setLoading(true);
      const from = reset ? 0 : leads.length;
      const { data } = await buildQuery().range(from, from + PAGE - 1).returns<Lead[]>();
      const rows = data ?? [];
      setHasMore(rows.length === PAGE);
      setLeads((prev) => (reset ? rows : [...prev, ...rows]));
      setLoading(false);
    },
    [buildQuery, leads.length],
  );

  const refreshStats = useCallback(async () => {
    const totalRes = await supabase.from("contacts").select("id", { count: "exact", head: true });
    const unRes = await supabase.from("contacts").select("id", { count: "exact", head: true }).is("salesperson_id", null);
    const total = totalRes.count ?? 0;
    const unassigned = unRes.count ?? 0;
    setStats({ total, unassigned, assigned: total - unassigned });
    const counts: Record<string, number> = {};
    await Promise.all(
      salespeople.map(async (sp) => {
        const r = await supabase.from("contacts").select("id", { count: "exact", head: true }).eq("salesperson_id", sp.id);
        counts[sp.id] = r.count ?? 0;
      }),
    );
    setAgentCounts(counts);
  }, [supabase, salespeople]);

  // Reload list when filters change (debounced for search).
  useEffect(() => {
    const t = setTimeout(() => {
      setSelected(new Set());
      void load(true);
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, agentFilter, search]);

  useEffect(() => {
    void refreshStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function quickSelect(n: number | "all") {
    const ids = (n === "all" ? leads : leads.slice(0, n)).map((l) => l.id);
    setSelected(new Set(ids));
  }

  async function assignSelected() {
    if (!assignTo || selected.size === 0) return;
    setBusy(true);
    for (const ids of chunk(Array.from(selected), 500)) {
      await supabase.from("contacts").update({ salesperson_id: assignTo }).in("id", ids);
    }
    setBusy(false);
    setMsg(`Assigned ${selected.size} lead(s) to ${nameOf(assignTo)}.`);
    setSelected(new Set());
    await load(true);
    await refreshStats();
    setTimeout(() => setMsg(null), 2500);
  }

  async function assignAllUnassigned() {
    if (!assignTo) return;
    if (!confirm(`Assign ALL ${stats.unassigned} unassigned leads to ${nameOf(assignTo)}?`)) return;
    setBusy(true);
    let q = supabase.from("contacts").update({ salesperson_id: assignTo }).is("salesperson_id", null);
    const s = safe(search);
    if (s) q = q.or(`name.ilike.%${s}%,phone.ilike.%${s}%`);
    await q;
    setBusy(false);
    setMsg(`Assigned all unassigned leads to ${nameOf(assignTo)}.`);
    setSelected(new Set());
    await load(true);
    await refreshStats();
    setTimeout(() => setMsg(null), 2500);
  }

  async function unassignSelected() {
    if (selected.size === 0) return;
    setBusy(true);
    for (const ids of chunk(Array.from(selected), 500)) {
      await supabase.from("contacts").update({ salesperson_id: null }).in("id", ids);
    }
    setBusy(false);
    setSelected(new Set());
    await load(true);
    await refreshStats();
  }

  async function autoAssignByTerritory() {
    setBusy(true);
    // Fetch all unassigned leads that have a territory
    const { data: unassigned } = await supabase
      .from("contacts")
      .select("id, territory")
      .is("salesperson_id", null)
      .not("territory", "is", null);

    if (!unassigned || unassigned.length === 0) {
      setBusy(false);
      setMsg("No unassigned leads with a specified territory found.");
      setTimeout(() => setMsg(null), 3000);
      return;
    }

    let assignedCount = 0;
    const updates: { id: string; salesperson_id: string }[] = [];

    // For each lead, find a matching salesperson
    // To balance load, we could track assignment counts, but for simplicity we pick randomly among matching
    for (const lead of unassigned) {
      if (!lead.territory) continue;
      const t = lead.territory.trim().toLowerCase();
      const matches = salespeople.filter(sp => sp.territory && sp.territory.trim().toLowerCase() === t);
      if (matches.length > 0) {
        const chosen = matches[Math.floor(Math.random() * matches.length)];
        updates.push({ id: lead.id, salesperson_id: chosen.id });
        assignedCount++;
      }
    }

    if (updates.length > 0) {
      for (const part of chunk(updates, 500)) {
        // Upsert by ID to update the salesperson_id
        await supabase.from("contacts").upsert(part, { onConflict: "id" });
      }
      setMsg(`Auto-assigned ${assignedCount} leads by territory.`);
      await load(true);
      await refreshStats();
    } else {
      setMsg("No telecallers found matching the leads' territories.");
    }
    
    setBusy(false);
    setTimeout(() => setMsg(null), 4000);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button className="primary" style={{ width: "auto", padding: "9px 16px" }} onClick={() => setImportOpen(true)}>
          ⬆ Import Leads
        </button>
        {msg && <span style={{ color: "var(--accent)", fontSize: 13 }}>{msg}</span>}
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
        <StatCard label="Unassigned" value={stats.unassigned} tone="#f59e0b" bg="rgba(245, 158, 11, 0.05)" />
        <StatCard label="Assigned" value={stats.assigned} tone="#3b82f6" bg="rgba(59, 130, 246, 0.05)" />
        <StatCard label="Total" value={stats.total} tone="#10b981" bg="rgba(16, 185, 129, 0.05)" />
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8 }}>
        <Tab active={tab === "unassigned"} onClick={() => { setTab("unassigned"); setAgentFilter(null); }}>
          Unassigned ({stats.unassigned})
        </Tab>
        <Tab active={tab === "assigned"} onClick={() => setTab("assigned")}>
          Assigned ({stats.assigned})
        </Tab>
      </div>

      {/* Telecaller chips (assigned tab → filter) */}
      {tab === "assigned" && salespeople.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Chip active={agentFilter === null} onClick={() => setAgentFilter(null)} label="All" count={stats.assigned} />
          {salespeople.map((sp) => (
            <Chip key={sp.id} active={agentFilter === sp.id} onClick={() => setAgentFilter(sp.id)} label={sp.full_name || "—"} count={agentCounts[sp.id] ?? 0} />
          ))}
        </div>
      )}

      <input
        className="search"
        placeholder="Search by name or phone…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ padding: "12px 16px", borderRadius: 12, border: "1px solid var(--border)", background: "rgba(255,255,255,0.02)", color: "var(--text)", backdropFilter: "blur(12px)", outline: "none", transition: "border 0.2s" }}
      />

      {/* Assign bar */}
      <div className="card" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", backdropFilter: "blur(12px)" }}>
        <span style={{ fontWeight: 600 }}>Assign to:</span>
        <select
          value={assignTo}
          onChange={(e) => setAssignTo(e.target.value)}
          style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--panel)", color: "var(--text)", outline: "none" }}
        >
          <option value="">Choose telecaller…</option>
          {salespeople.map((sp) => (
            <option key={sp.id} value={sp.id}>{sp.full_name || sp.id.slice(0, 8)}</option>
          ))}
        </select>
        <button className="primary" style={{ width: "auto", padding: "8px 14px" }} disabled={busy || !assignTo || selected.size === 0} onClick={assignSelected}>
          Assign selected ({selected.size})
        </button>
        {tab === "unassigned" && (
          <>
            <button className="link" style={{ color: "var(--accent)" }} disabled={busy || !assignTo || stats.unassigned === 0} onClick={assignAllUnassigned}>
              Assign all unassigned ({stats.unassigned})
            </button>
            <button className="link" style={{ color: "var(--success)" }} disabled={busy || stats.unassigned === 0} onClick={autoAssignByTerritory}>
              ✨ Auto-assign by Territory
            </button>
          </>
        )}
        {tab === "assigned" && selected.size > 0 && (
          <button className="link" style={{ color: "var(--muted)" }} disabled={busy} onClick={unassignSelected}>
            Unassign ({selected.size})
          </button>
        )}
      </div>

      {/* Quick select */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 13 }}>
        <span style={{ color: "var(--muted)" }}>Quick select:</span>
        {[10, 25, 50].map((n) => (
          <button key={n} className="link" style={{ color: "var(--accent)" }} onClick={() => quickSelect(n)} disabled={leads.length === 0}>☑ {n}</button>
        ))}
        <button className="link" style={{ color: "var(--accent)" }} onClick={() => quickSelect("all")} disabled={leads.length === 0}>☑ All loaded ({leads.length})</button>
        {selected.size > 0 && <button className="link" style={{ color: "var(--muted)" }} onClick={() => setSelected(new Set())}>Clear</button>}
      </div>

      {/* List */}
      {leads.length === 0 && !loading ? (
        <div className="empty">{tab === "unassigned" ? "No unassigned leads. Import some above." : "No assigned leads yet."}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {leads.map((l) => (
            <label key={l.id} className="card" style={{ display: "flex", gap: 12, alignItems: "center", cursor: "pointer", padding: 16, background: "rgba(255,255,255,0.015)", border: "1px solid var(--border)", transition: "all 0.2s ease" }}>
              <input type="checkbox" checked={selected.has(l.id)} onChange={() => toggle(l.id)} style={{ width: 18, height: 18, accentColor: "var(--accent)" }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 15, color: "#fff" }}>{l.name || l.phone}</div>
                <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 4, display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  <span style={{ color: "#cbd5e1" }}>📞 {l.phone}</span>
                  {l.company_name && <span>· 🏢 {l.company_name}</span>}
                  {l.territory && <span>· 📍 {l.territory}</span>}
                  {l.budget && <span>· 💰 {l.budget}</span>}
                </div>
                {tab === "assigned" && <div style={{ color: "var(--accent)", fontSize: 12, marginTop: 6, fontWeight: 500 }}>→ Assigned to: {nameOf(l.salesperson_id)}</div>}
              </div>
              <span className={`badge ${l.status}`} style={{ boxShadow: "0 0 10px rgba(255,255,255,0.05)" }}>{l.status}</span>
            </label>
          ))}
        </div>
      )}

      {hasMore && (
        <button className="link" style={{ color: "var(--accent)" }} disabled={loading} onClick={() => load(false)}>
          {loading ? "Loading…" : "Load more"}
        </button>
      )}

      {importOpen && (
        <ImportLeads
          companyId={companyId}
          salespeople={salespeople}
          onClose={() => setImportOpen(false)}
          onDone={async (n) => {
            setImportOpen(false);
            setMsg(`Imported ${n} lead(s).`);
            await load(true);
            await refreshStats();
            setTimeout(() => setMsg(null), 3000);
          }}
        />
      )}
    </div>
  );
}

function StatCard({ label, value, tone, bg }: { label: string; value: number; tone: string; bg: string }) {
  return (
    <div className="card" style={{ background: bg, border: `1px solid ${tone}22`, boxShadow: `0 8px 32px ${tone}10`, padding: "20px" }}>
      <div style={{ color: tone, fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</div>
      <div style={{ color: tone, fontSize: 32, fontWeight: 800, marginTop: 8 }}>{value.toLocaleString()}</div>
    </div>
  );
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "8px 16px",
        borderRadius: 50,
        border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
        background: active ? "var(--accent)" : "rgba(255,255,255,0.02)",
        color: active ? "#fff" : "var(--text)",
        cursor: "pointer",
        fontWeight: 600,
        transition: "all 0.2s ease",
        boxShadow: active ? "0 4px 12px rgba(16, 185, 129, 0.2)" : "none",
      }}
    >
      {children}
    </button>
  );
}

function Chip({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 14px",
        borderRadius: 50,
        border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
        background: active ? "var(--accent)" : "rgba(255,255,255,0.03)",
        color: active ? "#fff" : "var(--text)",
        cursor: "pointer",
        fontSize: 13,
        transition: "all 0.2s ease",
      }}
    >
      {label} <span style={{ opacity: 0.7, marginLeft: 6 }}>{count}</span>
    </button>
  );
}
