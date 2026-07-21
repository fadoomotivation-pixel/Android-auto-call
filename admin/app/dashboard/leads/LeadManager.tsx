"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ImportLeads } from "./ImportLeads";
import { LeadHistory } from "./LeadHistory";

type Sp = { id: string; full_name: string | null; territory: string | null; company_id?: string | null; company_name?: string | null };
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
  notes: string | null;
  temperature: string | null;
  last_contacted_at: string | null;
};

// Status chips shown on the admin board, in funnel order.
const STATUS_FILTERS: { key: string; label: string }[] = [
  { key: "new", label: "New" },
  { key: "callback", label: "Callback" },
  { key: "interested", label: "Interested" },
  { key: "site_visit", label: "Site Visit" },
  { key: "negotiation", label: "Negotiation" },
  { key: "token_paid", label: "Token" },
  { key: "booked", label: "Booked" },
  { key: "not_interested", label: "Not int." },
  { key: "lost", label: "Lost" },
];
const TEMP_META: Record<string, { label: string; color: string; bg: string }> = {
  hot: { label: "🔥 Hot", color: "#fca5a5", bg: "rgba(239,68,68,0.14)" },
  warm: { label: "🌤 Warm", color: "#fcd34d", bg: "rgba(245,158,11,0.14)" },
  cold: { label: "❄️ Cold", color: "#93c5fd", bg: "rgba(59,130,246,0.14)" },
};
function timeAgo(iso: string | null): string | null {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return null;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

const PAGE = 50;

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

export function LeadManager({ companyId, salespeople, isSuper = false }: { companyId: string; salespeople: Sp[]; isSuper?: boolean }) {
  const supabase = createClient();
  const nameOf = (id: string | null) => salespeople.find((s) => s.id === id)?.full_name || (id ? "—" : "Unassigned");
  // For the super admin, a telecaller may belong to another company. That rep's
  // company is the target the lead MOVES to (via admin_assign_contacts), so the
  // lead never ends up in one company while owned by another company's rep.
  const spOf = (id: string) => salespeople.find((s) => s.id === id);
  const isCrossCompany = (id: string) => {
    const c = spOf(id)?.company_id;
    return !!c && c !== companyId;
  };
  const labelOf = (s: Sp) => (isSuper && s.company_name ? `${s.full_name ?? "—"} · ${s.company_name}` : (s.full_name ?? "—"));
  // Last-10 digits — the phone identity used for dedup everywhere (matches the
  // 0080 DB trigger and the import check).
  const norm10 = (p: string) => (p || "").replace(/\D/g, "").slice(-10);

  // Super admin only: narrow the whole board to one company. Built from the
  // telecaller list the page already loaded (unique company_id → name).
  const companies = isSuper
    ? Array.from(
        new Map(
          salespeople
            .filter((s) => s.company_id)
            .map((s) => [s.company_id as string, s.company_name ?? "—"]),
        ).entries(),
      ).sort((a, b) => a[1].localeCompare(b[1]))
    : [];
  const [companyFilter, setCompanyFilter] = useState<string>("");
  // Reps shown in chips/assign menu — scoped to the picked company when set.
  const visibleReps = companyFilter ? salespeople.filter((s) => s.company_id === companyFilter) : salespeople;
  // Which company an import lands in. A super admin's own company is the
  // Platform HQ oversight tenant — importing there silently bypasses the
  // per-company dedup for the REAL tenant, so a super admin must first pick the
  // target company; a regular admin always imports into their own company.
  const importCompanyId = isSuper ? companyFilter : companyId;

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
  const [historyId, setHistoryId] = useState<string | null>(null);

  const [stats, setStats] = useState({ total: 0, unassigned: 0, assigned: 0 });
  const [agentCounts, setAgentCounts] = useState<Record<string, number>>({});
  // Super admin only: phone tails (last-10) that exist under MORE THAN ONE
  // company. Per-company dedup (0080) can't catch these — different tenants —
  // so the super admin sees them flagged and can decide what to do.
  const [crossCoPhones, setCrossCoPhones] = useState<Set<string>>(new Set());
  // Status + temperature filters and their live counts (per current scope).
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [tempFilter, setTempFilter] = useState<string>("");
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});

  const safe = (s: string) => s.trim().replace(/[,%()]/g, "");

  // The super admin oversees every company, so their queries must NOT be pinned
  // to their own company_id — a cross-company telecaller's leads live in that
  // rep's company. When the super admin picks a company filter, scope to THAT
  // company; otherwise span all. Regular admins always stay on their own
  // company. Super-admin RLS (migration 0006) permits the cross-company SELECT.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scopeCompany = <T,>(q: T): T => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!isSuper) return (q as any).eq("company_id", companyId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (companyFilter) return (q as any).eq("company_id", companyFilter);
    return q;
  };

  const buildQuery = useCallback(() => {
    let q = scopeCompany(
      supabase
        .from("contacts")
        .select("id, name, phone, company_name, status, salesperson_id, budget, territory, created_at, notes, temperature, last_contacted_at")
        .order("created_at", { ascending: false }),
    );
    if (tab === "unassigned") {
      q = q.is("salesperson_id", null);
    } else {
      q = q.not("salesperson_id", "is", null);
      if (agentFilter) q = q.eq("salesperson_id", agentFilter);
    }
    if (statusFilter) q = q.eq("status", statusFilter);
    if (tempFilter) q = q.eq("temperature", tempFilter);
    const s = safe(search);
    if (s) q = q.or(`name.ilike.%${s}%,phone.ilike.%${s}%`);
    return q;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, tab, agentFilter, search, companyId, isSuper, companyFilter, statusFilter, tempFilter]);

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
    const totalRes = await scopeCompany(supabase.from("contacts").select("id", { count: "exact", head: true }));
    const unRes = await scopeCompany(supabase.from("contacts").select("id", { count: "exact", head: true })).is("salesperson_id", null);
    const total = totalRes.count ?? 0;
    const unassigned = unRes.count ?? 0;
    setStats({ total, unassigned, assigned: total - unassigned });
    const counts: Record<string, number> = {};
    await Promise.all(
      salespeople.map(async (sp) => {
        // Count purely by rep — never by the admin's company — so a cross-company
        // telecaller shows their real assigned total instead of 0.
        const r = await supabase.from("contacts").select("id", { count: "exact", head: true }).eq("salesperson_id", sp.id);
        counts[sp.id] = r.count ?? 0;
      }),
    );
    setAgentCounts(counts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, salespeople, companyId, isSuper, companyFilter]);

  // Reload list when filters change (debounced for search).
  useEffect(() => {
    const t = setTimeout(() => {
      setSelected(new Set());
      void load(true);
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, agentFilter, search, companyFilter, statusFilter, tempFilter]);

  useEffect(() => {
    void refreshStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyFilter]);

  // Live per-status counts for the filter chips, respecting the company scope.
  // Paged so it isn't capped at PostgREST's 1000-row limit.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const counts: Record<string, number> = {};
      const P = 1000;
      for (let from = 0; ; from += P) {
        let q = supabase.from("contacts").select("status");
        if (!isSuper) q = q.eq("company_id", companyId);
        else if (companyFilter) q = q.eq("company_id", companyFilter);
        const { data, error } = await q.range(from, from + P - 1).returns<{ status: string }[]>();
        if (error) break;
        for (const r of data ?? []) counts[r.status] = (counts[r.status] ?? 0) + 1;
        if (!data || data.length < P) break;
      }
      if (!cancelled) setStatusCounts(counts);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyFilter, companyId, isSuper]);

  // Super admin only: find phones shared across companies. Page through every
  // contact (PostgREST caps a select at 1000) and keep the tails whose set of
  // company_ids has more than one entry.
  useEffect(() => {
    if (!isSuper) return;
    let cancelled = false;
    (async () => {
      const byTail = new Map<string, Set<string>>();
      const P = 1000;
      for (let from = 0; ; from += P) {
        const { data, error } = await supabase
          .from("contacts")
          .select("phone, company_id")
          .range(from, from + P - 1)
          .returns<{ phone: string; company_id: string | null }[]>();
        if (error) break;
        for (const r of data ?? []) {
          const t = norm10(r.phone);
          if (t.length < 10 || !r.company_id) continue;
          const set = byTail.get(t) ?? new Set<string>();
          set.add(r.company_id);
          byTail.set(t, set);
        }
        if (!data || data.length < P) break;
      }
      if (cancelled) return;
      const cross = new Set<string>();
      for (const [t, comps] of byTail) if (comps.size > 1) cross.add(t);
      setCrossCoPhones(cross);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuper, supabase]);

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

  /** Move a set of leads to a rep in ANOTHER company (super admin only). Uses the
   *  SECURITY DEFINER RPC so company_id + salesperson_id move together. */
  async function reassignCrossCompany(ids: string[]): Promise<boolean> {
    const target = spOf(assignTo);
    if (!target?.company_id) return false;
    let ok = true;
    for (const batch of chunk(ids, 500)) {
      const { error } = await supabase.rpc("admin_assign_contacts", {
        p_contact_ids: batch, p_company_id: target.company_id, p_salesperson_id: assignTo,
      });
      if (error) { ok = false; setMsg(`Assign failed: ${error.message}`); break; }
    }
    return ok;
  }

  async function assignSelected() {
    if (!assignTo || selected.size === 0) return;
    setBusy(true);
    const ids = Array.from(selected);
    if (isCrossCompany(assignTo)) {
      const ok = await reassignCrossCompany(ids);
      setBusy(false);
      if (!ok) { setTimeout(() => setMsg(null), 3500); return; }
    } else {
      for (const batch of chunk(ids, 500)) {
        await supabase.from("contacts").update({ salesperson_id: assignTo }).in("id", batch);
      }
      setBusy(false);
    }
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
    if (isCrossCompany(assignTo)) {
      // Cross-company needs explicit ids for the RPC — collect all unassigned first.
      const ids: string[] = [];
      let from = 0;
      let more = true;
      while (more) {
        let q = scopeCompany(supabase.from("contacts").select("id")).is("salesperson_id", null).range(from, from + 999);
        const s = safe(search);
        if (s) q = q.or(`name.ilike.%${s}%,phone.ilike.%${s}%`);
        const { data } = await q;
        const page = (data ?? []) as { id: string }[];
        ids.push(...page.map((r) => r.id));
        if (page.length < 1000) more = false;
        else from += 1000;
      }
      const ok = await reassignCrossCompany(ids);
      setBusy(false);
      if (!ok) { setTimeout(() => setMsg(null), 3500); return; }
    } else {
      let q = supabase.from("contacts").update({ salesperson_id: assignTo }).is("salesperson_id", null);
      const s = safe(search);
      if (s) q = q.or(`name.ilike.%${s}%,phone.ilike.%${s}%`);
      await q;
      setBusy(false);
    }
    setMsg(`Assigned all unassigned leads to ${nameOf(assignTo)}.`);
    setSelected(new Set());
    await load(true);
    await refreshStats();
    setTimeout(() => setMsg(null), 2500);
  }

  /** Round-robin every unassigned lead across ACTIVE telecallers (server-side
   *  RPC) — each rep gets a fair share, stamped fresh + pushed with the chime. */
  async function distributeFairly() {
    if (!confirm(`Distribute all ${stats.unassigned} unassigned leads EQUALLY among your active telecallers?`)) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("distribute_unassigned_leads");
    setBusy(false);
    const r = data as { ok?: boolean; assigned?: number; reps?: number; error?: string } | null;
    if (error || !r?.ok) {
      setMsg(`Distribute failed: ${r?.error || error?.message || "unknown error"}`);
    } else {
      setMsg(`⚖️ Distributed ${r.assigned} leads across ${r.reps} telecallers.`);
    }
    setSelected(new Set());
    await load(true);
    await refreshStats();
    setTimeout(() => setMsg(null), 4000);
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

  async function deleteSelected() {
    if (selected.size === 0) return;
    if (!confirm(`Are you sure you want to permanently delete ${selected.size} lead(s)?`)) return;
    setBusy(true);
    const { error } = await supabase.rpc("admin_delete_contacts", { p_contact_ids: Array.from(selected) });
    setBusy(false);
    if (error) {
      setMsg(`Error deleting leads: ${error.message}`);
    } else {
      setMsg(`Deleted ${selected.size} lead(s).`);
      setSelected(new Set());
      await load(true);
      await refreshStats();
    }
    setTimeout(() => setMsg(null), 3000);
  }

  async function autoAssignByTerritory() {
    // A super admin must pick a company first — otherwise this would assign
    // unassigned leads across EVERY company at once.
    if (isSuper && !companyFilter) {
      setMsg("Pick a company first to auto-assign its leads.");
      setTimeout(() => setMsg(null), 3000);
      return;
    }
    setBusy(true);
    // Fetch unassigned leads (scoped to the selected company) that have a territory
    const { data: unassigned } = await scopeCompany(
      supabase.from("contacts").select("id, territory"),
    )
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
      const matches = visibleReps.filter(sp => sp.territory && sp.territory.trim().toLowerCase() === t);
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
        <button
          className="primary"
          style={{ width: "auto", padding: "9px 16px", opacity: importCompanyId ? 1 : 0.5, cursor: importCompanyId ? "pointer" : "not-allowed" }}
          onClick={() => importCompanyId && setImportOpen(true)}
          disabled={!importCompanyId}
          title={importCompanyId ? "" : "Pick a company first so leads import into it (and dedupe against it)."}
        >
          ⬆ Import Leads
        </button>
        {isSuper && companies.length > 0 && (
          <select
            value={companyFilter}
            onChange={(e) => { setCompanyFilter(e.target.value); setAgentFilter(null); }}
            title="Filter the whole board to one company"
            style={{ padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--panel)", color: "var(--text)", outline: "none" }}
          >
            <option value="">🏢 All companies</option>
            {companies.map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
        )}
        {isSuper && !importCompanyId && (
          <span style={{ color: "#f59e0b", fontSize: 13 }}>← Pick a company to import into it</span>
        )}
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
          {visibleReps.map((sp) => (
            <Chip key={sp.id} active={agentFilter === sp.id} onClick={() => setAgentFilter(sp.id)} label={labelOf(sp)} count={agentCounts[sp.id] ?? 0} />
          ))}
        </div>
      )}

      {/* Status filter chips — with live counts (whole scope, not just this tab). */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Chip active={statusFilter === ""} onClick={() => setStatusFilter("")} label="All statuses" count={stats.total} />
        {STATUS_FILTERS.filter((s) => (statusCounts[s.key] ?? 0) > 0 || statusFilter === s.key).map((s) => (
          <Chip key={s.key} active={statusFilter === s.key} onClick={() => setStatusFilter(statusFilter === s.key ? "" : s.key)} label={s.label} count={statusCounts[s.key] ?? 0} />
        ))}
      </div>

      {/* Temperature filter */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {(["hot", "warm", "cold"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTempFilter(tempFilter === t ? "" : t)}
            style={{
              fontSize: 12.5, padding: "5px 12px", borderRadius: 999, cursor: "pointer",
              border: `1px solid ${tempFilter === t ? TEMP_META[t].color : "var(--border)"}`,
              background: tempFilter === t ? TEMP_META[t].bg : "transparent",
              color: tempFilter === t ? TEMP_META[t].color : "var(--muted)",
            }}
          >
            {TEMP_META[t].label}
          </button>
        ))}
      </div>

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
          {visibleReps.map((sp) => (
            <option key={sp.id} value={sp.id}>{labelOf(sp)}</option>
          ))}
        </select>
        {isSuper && assignTo && isCrossCompany(assignTo) && (
          <span style={{ fontSize: 12, color: "#f59e0b" }}>
            ⚠ Moves the lead(s) into {spOf(assignTo)?.company_name}&apos;s account.
          </span>
        )}
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
            <button className="link" style={{ color: "var(--accent)", fontWeight: 600 }} disabled={busy || stats.unassigned === 0} onClick={distributeFairly}>
              ⚖️ Distribute equally
            </button>
          </>
        )}
        {tab === "assigned" && selected.size > 0 && (
          <button className="link" style={{ color: "var(--muted)" }} disabled={busy} onClick={unassignSelected}>
            Unassign ({selected.size})
          </button>
        )}
        {selected.size > 0 && (
          <button className="link" style={{ color: "#ef4444" }} disabled={busy} onClick={deleteSelected}>
            🗑️ Delete ({selected.size})
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
                <div style={{ fontWeight: 600, fontSize: 15, color: "#fff", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  {l.name || l.phone}
                  {l.temperature && TEMP_META[l.temperature] && (
                    <span style={{ fontSize: 11, fontWeight: 600, color: TEMP_META[l.temperature].color, background: TEMP_META[l.temperature].bg, borderRadius: 6, padding: "2px 8px" }}>
                      {TEMP_META[l.temperature].label}
                    </span>
                  )}
                  {isSuper && crossCoPhones.has(norm10(l.phone)) && (
                    <span
                      title="This phone number also exists under another company"
                      style={{ fontSize: 11, fontWeight: 600, color: "#f59e0b", background: "rgba(245, 158, 11, 0.12)", border: "1px solid rgba(245, 158, 11, 0.35)", borderRadius: 6, padding: "2px 8px" }}
                    >
                      ⧉ also in another company
                    </span>
                  )}
                </div>
                <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 4, display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  <span style={{ color: "#cbd5e1" }}>📞 {l.phone}</span>
                  {l.company_name && <span>· 🏢 {l.company_name}</span>}
                  {l.territory && <span>· 📍 {l.territory}</span>}
                  {l.budget && <span>· 💰 {l.budget}</span>}
                  {timeAgo(l.last_contacted_at) && <span>· 📞 last: {timeAgo(l.last_contacted_at)}</span>}
                  {l.created_at && <span>· 🕒 {new Date(l.created_at).toLocaleDateString()}</span>}
                </div>
                {l.notes && (
                  <div style={{ marginTop: 8, fontSize: 13, color: "var(--text)", padding: "8px 12px", background: "rgba(16, 185, 129, 0.05)", borderLeft: "3px solid var(--accent)", borderRadius: 6 }}>
                    <strong>Admin/App Notes:</strong> {l.notes}
                  </div>
                )}
                {tab === "assigned" && <div style={{ color: "var(--accent)", fontSize: 12, marginTop: 6, fontWeight: 500 }}>→ Assigned to: {nameOf(l.salesperson_id)}</div>}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-end" }}>
                <span className={`badge ${l.status}`} style={{ boxShadow: "0 0 10px rgba(255,255,255,0.05)" }}>{l.status}</span>
                <button 
                  className="link" 
                  style={{ fontSize: 12, padding: "4px 10px", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "var(--muted)", background: "rgba(255,255,255,0.03)" }} 
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setHistoryId(l.id); }}
                >
                  📖 View History
                </button>
              </div>
            </label>
          ))}
        </div>
      )}

      {hasMore && (
        <button className="link" style={{ color: "var(--accent)" }} disabled={loading} onClick={() => load(false)}>
          {loading ? "Loading…" : "Load more"}
        </button>
      )}

      {importOpen && importCompanyId && (
        <ImportLeads
          companyId={importCompanyId}
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

      {historyId && <LeadHistory contactId={historyId} onClose={() => setHistoryId(null)} />}
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
