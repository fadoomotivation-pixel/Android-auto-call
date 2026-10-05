"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ImportLeads } from "./ImportLeads";
import { loadStages, repStages, ACTION_STATES, type Stage } from "@/lib/dashboard/stage";
import { LeadHistory } from "./LeadHistory";
import { LeadList } from "./LeadList";
import { buildLeadViews, norm10, TEMPS, type Lead } from "./leadView";

type Sp = { id: string; full_name: string | null; territory: string | null; company_id?: string | null; company_name?: string | null };

// The chips used to be nine hand-written entries here. Four live statuses had
// no chip at all — 91 leads, 11.6% of the book, unreachable by any filter —
// while three chips matched zero rows. They now come from lead_stages, the same
// rows the Android app and every report read, so the three can never disagree
// again. See admin/lib/dashboard/stage.ts.

const PAGE = 50;

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

export function LeadManager({
  companyId, salespeople, isSuper = false, allCompanies = [],
}: {
  companyId: string;
  salespeople: Sp[];
  isSuper?: boolean;
  /** Super admin only: every company on the platform, straight from the
   *  companies table. See the note on `companies` below for why this stopped
   *  being inferred from the telecaller list. */
  allCompanies?: [string, string][];
}) {
  const params = useSearchParams();
  // One client for the life of the page. A new client every render makes every
  // query callback change, and the list would refetch on each keystroke.
  const supabase = useMemo(() => createClient(), []);
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
  // Super admin only: narrow the whole board to one company. Built from the
  // telecaller list the page already loaded (unique company_id → name).
  // THE COMPANY LIST COMES FROM THE COMPANIES TABLE, NOT FROM THE REPS.
  //
  // It used to be inferred: every distinct company_id among the telecallers.
  // That made the entire import flow depend on a query two components away —
  // if the telecaller list came back short or without company_id for any
  // reason, this list was empty, which left the import modal with no company
  // to pick, therefore no target company, therefore a permanently disabled
  // "Which rep?" dropdown and a red "Choose a company first" pointing at a
  // control that was not on screen. A founder cannot debug that from the UI.
  //
  // It was also wrong on its own terms: a company that has not hired a
  // telecaller yet still exists and can still receive imported leads.
  const companies = isSuper
    ? (allCompanies.length
        ? [...allCompanies].sort((a, b) => a[1].localeCompare(b[1]))
        : Array.from(
            new Map(
              salespeople
                .filter((s) => s.company_id)
                .map((s) => [s.company_id as string, s.company_name ?? "—"]),
            ).entries(),
          ).sort((a, b) => a[1].localeCompare(b[1])))
    : [];
  const [companyFilter, setCompanyFilter] = useState<string>("");
  // Reps shown in chips/assign menu — scoped to the picked company when set.
  const visibleReps = companyFilter ? salespeople.filter((s) => s.company_id === companyFilter) : salespeople;
  // Which company an import lands in. A super admin's own company is the
  // Platform HQ oversight tenant — importing there silently bypasses the
  // per-company dedup for the REAL tenant. So for a super admin this
  // pre-fills the modal's required in-modal company picker: from the board's
  // company filter if one is set, else the first real company, so the modal
  // never opens dead — with nothing pre-picked the rep dropdown below it has
  // nothing to show and reads as broken until the admin makes an unrelated
  // dropdown choice first. A regular admin always imports into their own.
  const importCompanyId = isSuper ? (companyFilter || companies[0]?.[0] || "") : companyId;

  const [tab, setTab] = useState<"unassigned" | "assigned">("unassigned");
  const [agentFilter, setAgentFilter] = useState<string | null>(null);
  const [search, setSearch] = useState(() => params.get("q") ?? "");
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assignTo, setAssignTo] = useState("");
  /** Reset the lead so the new rep opens it like one that just arrived. Off by
   *  default — see the checkbox in the assign bar for why. */
  const [asNew, setAsNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [historyId, setHistoryId] = useState<string | null>(() => params.get("id"));

  const [stats, setStats] = useState({ total: 0, unassigned: 0, assigned: 0 });
  const [statsKnown, setStatsKnown] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [agentCounts, setAgentCounts] = useState<Record<string, number | null>>({});
  // Super admin only: phone tails (last-10) that exist under MORE THAN ONE
  // company. Per-company dedup (0080) can't catch these — different tenants —
  // so the super admin sees them flagged and can decide what to do.
  const [crossCoPhones, setCrossCoPhones] = useState<Set<string>>(new Set());
  // Status + temperature filters and their live counts (per current scope).
  // Two axes, kept apart exactly as the database keeps them: stageFilter is
  // WHERE THE DEAL IS, actionFilter is WHAT TO DO NOW. A lead always has both,
  // which is why they are separate filters and not one row of mixed chips.
  const [stageFilter, setStageFilter] = useState<string>("");
  const [actionFilter, setActionFilter] = useState<string>("");
  const [stages, setStages] = useState<Stage[]>([]);
  const [stagesReady, setStagesReady] = useState(false);
  const [stagesError, setStagesError] = useState<string | null>(null);
  const [actionIds, setActionIds] = useState<{ code: string; ids: string[]; failed?: string } | null>(null);
  const [tempFilter, setTempFilter] = useState<string>("");
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [statusError, setStatusError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [crossError, setCrossError] = useState<string | null>(null);

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
        .select("id, name, phone, company_name, status, stage, salesperson_id, budget, territory, created_at, notes, temperature, last_contacted_at")
        .order("created_at", { ascending: false }),
    );
    if (tab === "unassigned") {
      q = q.is("salesperson_id", null);
    } else {
      q = q.not("salesperson_id", "is", null);
      if (agentFilter) q = q.eq("salesperson_id", agentFilter);
    }
    if (stageFilter) q = q.eq("stage", stageFilter);
    // Action state is DERIVED (v_lead_workstate), so it cannot be a column
    // filter on contacts. The ids are resolved separately below and joined here.
    if (actionFilter && actionIds && actionIds.code === actionFilter) {
      q = q.in("id", actionIds.ids.length ? actionIds.ids : ["00000000-0000-0000-0000-000000000000"]);
    }
    if (tempFilter) q = q.eq("temperature", tempFilter);
    const s = safe(debouncedSearch);
    if (s) q = q.or(`name.ilike.%${s}%,phone.ilike.%${s}%`);
    return q;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, tab, agentFilter, debouncedSearch, companyId, isSuper, companyFilter, stageFilter, tempFilter, actionFilter, actionIds]);

  const leadsRef = useRef<Lead[]>([]);
  leadsRef.current = leads;
  const loadGen = useRef(0);

  const load = useCallback(
    async (reset: boolean) => {
      const ticket = ++loadGen.current;
      // The action chip changed and its ids are not back yet. Wait, rather
      // than listing every lead for a moment and calling that the filter.
      if (actionFilter && (!actionIds || actionIds.code !== actionFilter)) {
        setLoading(true);
        return;
      }
      if (actionFilter && actionIds?.failed) {
        setListError(actionIds.failed);
        setLeads([]);
        setHasMore(false);
        setLoading(false);
        return;
      }
      setLoading(true);
      const from = reset ? 0 : leadsRef.current.length;
      const { data, error } = await buildQuery().range(from, from + PAGE - 1).returns<Lead[]>();
      if (ticket !== loadGen.current) return;
      if (error) {
        if (reset) setLeads([]);
        setListError(error.message);
        setHasMore(false);
        setLoading(false);
        return;
      }
      setListError(null);
      const rows = data ?? [];
      setHasMore(rows.length === PAGE);
      setLeads((prev) => (reset ? rows : [...prev, ...rows]));
      setLoading(false);
    },
    [buildQuery, actionFilter, actionIds],
  );

  const refreshStats = useCallback(async () => {
    const totalRes = await scopeCompany(supabase.from("contacts").select("id", { count: "exact", head: true }));
    const unRes = await scopeCompany(supabase.from("contacts").select("id", { count: "exact", head: true })).is("salesperson_id", null);
    if (totalRes.error || unRes.error) {
      setStatsError(totalRes.error?.message || unRes.error?.message || "Could not count leads.");
    } else {
      const total = totalRes.count ?? 0;
      const unassigned = unRes.count ?? 0;
      setStats({ total, unassigned, assigned: total - unassigned });
      setStatsKnown(true);
      setStatsError(null);
    }
    const counts: Record<string, number | null> = {};
    let repFail: string | null = null;
    await Promise.all(
      salespeople.map(async (sp) => {
        // Count purely by rep — never by the admin's company — so a cross-company
        // telecaller shows their real assigned total instead of 0.
        const r = await supabase.from("contacts").select("id", { count: "exact", head: true }).eq("salesperson_id", sp.id);
        if (r.error) {
          counts[sp.id] = null;
          repFail = r.error.message;
        } else {
          counts[sp.id] = r.count ?? 0;
        }
      }),
    );
    setAgentCounts(counts);
    if (repFail) setStatsError((prev) => prev ?? `Could not count some telecallers. (${repFail})`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, salespeople, companyId, isSuper, companyFilter]);

  // Search waits. Stage, temperature, and rep chips do not — those are a click.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Reload list when filters change. Search is already debounced above.
  useEffect(() => {
    setSelected(new Set());
    void load(true);
    return () => { loadGen.current += 1; };
  }, [load]);

  useEffect(() => {
    void refreshStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyFilter]);

  // The stage vocabulary, straight from the table both clients read.
  useEffect(() => {
    let off = false;
    void loadStages(supabase).then((rows) => {
      if (off) return;
      setStages(rows);
      setStagesReady(true);
      setStagesError(null);
    }).catch((e: unknown) => {
      if (off) return;
      setStagesReady(true);
      setStagesError(e instanceof Error ? e.message : "Could not load stages.");
    });
    return () => { off = true; };
  }, [supabase]);

  // Action state lives in a view, so filtering by it means resolving ids first.
  // Only the ids are fetched (one narrow column), and only while an action chip
  // is actually selected — no cost on the default view.
  useEffect(() => {
    let off = false;
    if (!actionFilter) { setActionIds(null); return; }
    const code = actionFilter;
    (async () => {
      let q = supabase.from("v_lead_workstate").select("contact_id").eq("action_state", code);
      if (!isSuper) q = q.eq("company_id", companyId);
      else if (companyFilter) q = q.eq("company_id", companyFilter);
      const { data, error } = await q.limit(5000).returns<{ contact_id: string }[]>();
      if (off) return;
      if (error) {
        setActionIds({ code, ids: [], failed: error.message });
        return;
      }
      setActionIds({ code, ids: (data ?? []).map((r) => r.contact_id) });
    })();
    return () => { off = true; };
  }, [supabase, actionFilter, companyId, isSuper, companyFilter]);

  // Live per-status counts for the filter chips, respecting the company scope.
  // Paged so it isn't capped at PostgREST's 1000-row limit.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const counts: Record<string, number> = {};
      const P = 1000;
      for (let from = 0; ; from += P) {
        let q = supabase.from("contacts").select("stage");
        if (!isSuper) q = q.eq("company_id", companyId);
        else if (companyFilter) q = q.eq("company_id", companyFilter);
        const { data, error } = await q.range(from, from + P - 1).returns<{ stage: string }[]>();
        if (error) {
          if (!cancelled) setStatusError(error.message);
          return;
        }
        for (const r of data ?? []) counts[r.stage] = (counts[r.stage] ?? 0) + 1;
        if (!data || data.length < P) break;
      }
      if (!cancelled) {
        setStatusCounts(counts);
        setStatusError(null);
      }
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
        if (error) {
          if (!cancelled) setCrossError(error.message);
          return;
        }
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
      setCrossError(null);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuper, supabase]);

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
        p_as_new: asNew,
      });
      if (error) { ok = false; setMsg(`Assign failed: ${error.message}`); break; }
    }
    return ok;
  }

  async function assignSelected() {
    if (!assignTo || selected.size === 0) return;
    // Asked once, plainly, and only for the reset. The rep cannot undo it and
    // cannot even see that it happened, so the person clicking should know
    // exactly what the other side will look like.
    if (asNew && !confirm(
      `Give ${selected.size} lead(s) to ${nameOf(assignTo)} as BRAND-NEW leads?\n\n` +
      `They will open in New, with no stage, no notes, no score and no call history — ` +
      `as if they had just arrived.\n\n` +
      `Nothing is deleted: you and the founder keep the full history, and any callback ` +
      `the previous rep had booked is cancelled.`
    )) return;
    setBusy(true);
    const ids = Array.from(selected);
    if (isCrossCompany(assignTo)) {
      const ok = await reassignCrossCompany(ids);
      setBusy(false);
      if (!ok) { setTimeout(() => setMsg(null), 3500); return; }
    } else {
      // A HANDOVER IS NOT ONE COLUMN.
      //
      // This was a bare update of contacts.salesperson_id, which left the lead's
      // pending callbacks with the OLD rep — follow_ups carries its own
      // salesperson_id and the app builds a rep's day out of it. So the new
      // owner's Follow-up tab stayed empty for a lead that owed a call today,
      // and the old rep kept being told to ring a customer who was no longer
      // theirs. reassign_contacts() moves both, and refuses a target who is not
      // in the same company as the leads.
      for (const batch of chunk(ids, 500)) {
        const { error } = await supabase.rpc("reassign_contacts", {
          p_contact_ids: batch, p_salesperson_id: assignTo, p_as_new: asNew,
        });
        if (error) {
          setBusy(false);
          setMsg(`Assign failed: ${error.message}`);
          setTimeout(() => setMsg(null), 3500);
          return;
        }
      }
      setBusy(false);
    }
    setMsg(`Assigned ${selected.size} lead(s) to ${nameOf(assignTo)}${asNew ? " as brand-new leads" : ""}.`);
    setSelected(new Set());
    await load(true);
    await refreshStats();
    setTimeout(() => setMsg(null), 2500);
  }

  async function assignAllUnassigned() {
    if (!assignTo) return;
    if (!confirm(`Assign ALL ${stats.unassigned} unassigned leads to ${nameOf(assignTo)}${asNew ? " AS BRAND-NEW LEADS (no stage, notes, score or call history)" : ""}?`)) return;
    setBusy(true);
    // Both the cross-company move and the reset need explicit ids for their
    // RPC; only the plain same-company case can be done as one bulk update.
    if (isCrossCompany(assignTo) || asNew) {
      const ids: string[] = [];
      let from = 0;
      let more = true;
      while (more) {
        let q = scopeCompany(supabase.from("contacts").select("id")).is("salesperson_id", null).range(from, from + 999);
        const s = safe(debouncedSearch);
        if (s) q = q.or(`name.ilike.%${s}%,phone.ilike.%${s}%`);
        const { data } = await q;
        const page = (data ?? []) as { id: string }[];
        ids.push(...page.map((r) => r.id));
        if (page.length < 1000) more = false;
        else from += 1000;
      }
      if (isCrossCompany(assignTo)) {
        const ok = await reassignCrossCompany(ids);
        setBusy(false);
        if (!ok) { setTimeout(() => setMsg(null), 3500); return; }
      } else {
        for (const batch of chunk(ids, 500)) {
          const { error } = await supabase.rpc("reassign_contacts", {
            p_contact_ids: batch, p_salesperson_id: assignTo, p_as_new: true,
          });
          if (error) {
            setBusy(false);
            setMsg(`Assign failed: ${error.message}`);
            setTimeout(() => setMsg(null), 3500);
            return;
          }
        }
        setBusy(false);
      }
    } else {
      let q = supabase.from("contacts").update({ salesperson_id: assignTo }).is("salesperson_id", null);
      const s = safe(debouncedSearch);
      if (s) q = q.or(`name.ilike.%${s}%,phone.ilike.%${s}%`);
      await q;
      setBusy(false);
    }
    setMsg(`Assigned all unassigned leads to ${nameOf(assignTo)}${asNew ? " as brand-new leads" : ""}.`);
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
      setMsg(`Distributed ${r.assigned} leads across ${r.reps} telecallers.`);
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

  const repNames = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of salespeople) m.set(s.id, s.full_name || "—");
    return m;
  }, [salespeople]);
  const views = useMemo(
    () => buildLeadViews(leads, stages, repNames, crossCoPhones, tab === "assigned"),
    [leads, stages, repNames, crossCoPhones, tab],
  );
  const openLead = useCallback((id: string) => setHistoryId(id), []);
  const toggleLead = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  return (
    <div className="stack lead-board">
      <div className="toolbar">
        <button
          className="primary"
          onClick={() => setImportOpen(true)}
        >
          Import Leads
        </button>
        {isSuper && companies.length > 0 && (
          <select
            value={companyFilter}
            onChange={(e) => { setCompanyFilter(e.target.value); setAgentFilter(null); }}
            title="Filter the whole board to one company"
          >
            <option value="">All companies</option>
            {companies.map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
        )}
        {msg && <span className="lead-loading" style={{ color: "var(--accent)" }}>{msg}</span>}
      </div>

      {statsError && <div className="error">{statsError}</div>}
      {stagesError && <div className="error">Could not load stages. ({stagesError})</div>}
      {statusError && <div className="error">Could not count stages. ({statusError})</div>}
      {crossError && (
        <div className="error">Could not check numbers that exist in more than one company. ({crossError})</div>
      )}
      {listError && <div className="error">Could not load leads. ({listError})</div>}

      {/* Stats */}
      <div className="cards" style={{ marginBottom: 0 }}>
        <StatCard label="Unassigned" value={statsKnown ? stats.unassigned : "—"} tone="var(--warn)" />
        <StatCard label="Assigned" value={statsKnown ? stats.assigned : "—"} tone="var(--accent)" />
        <StatCard label="Total" value={statsKnown ? stats.total : "—"} tone="var(--good)" />
      </div>

      {/* Tabs */}
      <div className="lead-segs" role="tablist">
        <Tab active={tab === "unassigned"} onClick={() => { setTab("unassigned"); setAgentFilter(null); }}>
          Unassigned ({statsKnown ? stats.unassigned : "—"})
        </Tab>
        <Tab active={tab === "assigned"} onClick={() => setTab("assigned")}>
          Assigned ({statsKnown ? stats.assigned : "—"})
        </Tab>
      </div>

      {/* Telecaller chips (assigned tab → filter) */}
      {tab === "assigned" && salespeople.length > 0 && (
        <div className="toolbar">
          <Chip active={agentFilter === null} onClick={() => setAgentFilter(null)} label="All" count={statsKnown ? stats.assigned : "—"} />
          {visibleReps.map((sp) => (
            <Chip key={sp.id} active={agentFilter === sp.id} onClick={() => setAgentFilter(sp.id)} label={labelOf(sp)} count={agentCounts[sp.id] ?? "—"} />
          ))}
        </div>
      )}

      {/* ── What to do now — the ACTION axis, derived from the clock ──
          Kept visually and verbally separate from the stage row below, because
          conflating the two is what made the same lead look like it belonged to
          several tabs at once on the phone. "Today" is a filter here, never a
          stage. */}
      <div>
        <div className="kicker" style={{ marginBottom: 8 }}>
          What to do now
        </div>
        <div className="toolbar">
          <Chip active={actionFilter === ""} onClick={() => setActionFilter("")} label="Any" count={statsKnown ? stats.total : "—"} />
          {ACTION_STATES.map((a) => (
            <button
              key={a.code}
              type="button"
              title={a.hint}
              onClick={() => setActionFilter(actionFilter === a.code ? "" : a.code)}
              className={actionFilter === a.code ? "chip active" : "chip"}
            >
              <span className="status-dot" style={{ color: a.color }} />
              {a.label}
            </button>
          ))}
        </div>
        {actionFilter && (
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>
            {ACTION_STATES.find((a) => a.code === actionFilter)?.hint}
          </div>
        )}
      </div>

      {/* ── Where the deal is — the STAGE axis, from lead_stages ──
          Mutually exclusive and generated from the table, so these chips, the
          Android tabs and every report count the same leads. */}
      <div className="kicker">
        Where the deal is
      </div>
      <div className="lead-stage-row">
        <Chip active={stageFilter === ""} onClick={() => setStageFilter("")} label="All stages" count={statsKnown ? stats.total : "—"} />
        {repStages(stages).filter((st) => statusError || (statusCounts[st.code] ?? 0) > 0 || stageFilter === st.code).map((st) => (
          <Chip
            key={st.code}
            active={stageFilter === st.code}
            onClick={() => setStageFilter(stageFilter === st.code ? "" : st.code)}
            label={st.label}
            count={statusError ? "—" : (statusCounts[st.code] ?? 0)}
            dot={st.color}
          />
        ))}
      </div>

      {/* Temperature filter */}
      <div className="toolbar">
        {TEMPS.map((t) => (
          <button
            key={t.code}
            type="button"
            className={tempFilter === t.code ? "chip active" : "chip"}
            onClick={() => setTempFilter(tempFilter === t.code ? "" : t.code)}
          >
            <span className="status-dot" style={{ color: t.color }} />
            {t.label}
          </button>
        ))}
      </div>

      <input
        className="search"
        placeholder="Search by name or phone…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {/* Assign bar */}
      <div className="card toolbar">
        <span style={{ fontWeight: 600 }}>Assign to:</span>
        <select
          value={assignTo}
          onChange={(e) => setAssignTo(e.target.value)}
          style={{ width: "auto", minWidth: 180 }}
        >
          <option value="">Choose telecaller…</option>
          {visibleReps.map((sp) => (
            <option key={sp.id} value={sp.id}>{labelOf(sp)}</option>
          ))}
        </select>
        {isSuper && assignTo && isCrossCompany(assignTo) && (
          <span className="warn-line" style={{ marginTop: 0 }}>
            Moves the lead(s) into {spOf(assignTo)?.company_name}&apos;s account.
          </span>
        )}

        {/* HANDING A LEAD OVER AND HANDING IT OVER AS NEW ARE DIFFERENT JOBS.
            A rep goes on leave and a colleague picks up the conversation —
            there the history is the point, and losing it means ringing a buyer
            to ask what they already said. Redistributing a pile of old leads is
            the opposite: the last rep's "not interested" from March is exactly
            what stops the new one calling with an open mind.
            So it is a choice, made per batch, and off by default — the
            destructive reading of an ambiguous click should never be the
            silent one. */}
        <label style={{
          display: "flex", alignItems: "center", gap: 7, fontSize: 13,
          padding: "6px 10px", borderRadius: 8, cursor: "pointer",
          background: asNew ? "rgba(245,158,11,0.12)" : "transparent",
          border: `1px solid ${asNew ? "rgba(245,158,11,0.4)" : "var(--border)"}`,
        }}>
          <input type="checkbox" checked={asNew} onChange={(e) => setAsNew(e.target.checked)} />
          <span style={{ fontWeight: asNew ? 600 : 400 }}>Give as a brand-new lead</span>
        </label>

        <button className="primary" disabled={busy || !assignTo || selected.size === 0} onClick={assignSelected}>
          Assign selected ({selected.size})
        </button>
        {tab === "unassigned" && (
          <>
            <button className="link" disabled={busy || !assignTo || stats.unassigned === 0} onClick={assignAllUnassigned}>
              Assign all unassigned ({stats.unassigned})
            </button>
            <button className="link" disabled={busy || stats.unassigned === 0} onClick={autoAssignByTerritory}>
              Auto-assign by Territory
            </button>
            <button className="link" disabled={busy || stats.unassigned === 0} onClick={distributeFairly}>
              Distribute equally
            </button>
          </>
        )}
        {tab === "assigned" && selected.size > 0 && (
          <button className="link" disabled={busy} onClick={unassignSelected}>
            Unassign ({selected.size})
          </button>
        )}
        {selected.size > 0 && (
          <button className="link" style={{ color: "var(--bad)", borderColor: "rgba(255, 69, 58, 0.45)" }} disabled={busy} onClick={deleteSelected}>
            Delete ({selected.size})
          </button>
        )}
      </div>

      {/* Quick select */}
      <div className="toolbar" style={{ fontSize: 13 }}>
        <span style={{ color: "var(--muted)" }}>Quick select:</span>
        {[10, 25, 50].map((n) => (
          <button key={n} className="link" onClick={() => quickSelect(n)} disabled={leads.length === 0}>{n}</button>
        ))}
        <button className="link" onClick={() => quickSelect("all")} disabled={leads.length === 0}>All loaded ({leads.length})</button>
        {selected.size > 0 && <button className="link" onClick={() => setSelected(new Set())}>Clear</button>}
      </div>

      {/* List. Rows are windowed: a few hundred stay in memory, only the
          ones on screen are mounted. */}
      {leads.length === 0 && !loading && !listError ? (
        <div className="empty">
          {stageFilter || actionFilter || tempFilter || debouncedSearch || agentFilter
            ? "No leads match these filters."
            : tab === "unassigned" ? "No unassigned leads. Import some above." : "No assigned leads yet."}
        </div>
      ) : leads.length === 0 && loading ? (
        <div className="empty">Loading leads…</div>
      ) : leads.length > 0 ? (
        <LeadList views={views} selected={selected} onToggle={toggleLead} onOpen={openLead} />
      ) : null}

      <div className="toolbar">
        {loading && leads.length > 0 && <span className="lead-loading">Loading…</span>}
        <span className="lead-loading">{leads.length} loaded{hasMore ? ". More are still on the server." : "."}</span>
        {hasMore && (
          <button type="button" className="link" disabled={loading} onClick={() => load(false)}>
            {loading ? "Loading…" : "Load more"}
          </button>
        )}
      </div>

      {importOpen && (
        <ImportLeads
          companyId={importCompanyId}
          companies={isSuper ? companies : undefined}
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

      {historyId && (
        <LeadHistory
          contactId={historyId}
          stages={stages}
          stagesFailed={!!stagesError}
          stagesReady={stagesReady}
          assigneeName={nameOf}
          onClose={() => setHistoryId(null)}
        />
      )}
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number | string; tone: string }) {
  return (
    <div className="card stat">
      <div className="label"><span className="tone-dot" style={{ background: tone }} />{label}</div>
      <div className="value">{typeof value === "number" ? value.toLocaleString("en-IN") : value}</div>
    </div>
  );
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" className={active ? "seg active" : "seg"} onClick={onClick}>
      {children}
    </button>
  );
}

function Chip({ active, onClick, label, count, dot }: { active: boolean; onClick: () => void; label: string; count: number | string; dot?: string }) {
  return (
    <button type="button" className={active ? "chip active" : "chip"} onClick={onClick}>
      {dot && <span className="status-dot" style={{ color: dot }} />}
      {label} <span className="count">{count}</span>
    </button>
  );
}
