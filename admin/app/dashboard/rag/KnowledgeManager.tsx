"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { createClient } from "@/lib/supabase/client";

type Company = { id: string; name: string | null };

interface Chunk {
  id: string;
  title: string | null;
  source_kind: string;
  source_id: string | null;
  company_id: string | null;
}

interface Group {
  key: string;
  scope: "global" | "company";
  companyId: string | null;
  sourceId: string | null;
  title: string;
  kind: string;
  ids: string[];
}

/**
 * Manage / delete trained knowledge. The AI brain shouldn't get polluted — this
 * lets you remove a source you no longer want. Isolation is enforced by RLS:
 * a super-admin can delete GLOBAL (all-company) knowledge and any company's; a
 * company admin can only delete their own company's. Global rows are read-only
 * for a non-super admin.
 */
export function KnowledgeManager({ isSuper, companies }: { isSuper: boolean; companies: Company[] }) {
  const supabase = useMemo(() => createClient(), []);
  const [chunks, setChunks] = useState<Chunk[] | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const companyName = useMemo(() => {
    const m = new Map(companies.map((c) => [c.id, c.name ?? "Company"]));
    return (id: string | null) => (id ? m.get(id) ?? "Company" : "🌐 Global (all companies)");
  }, [companies]);

  const load = useCallback(async () => {
    setErr(null);
    const { data, error } = await supabase
      .from("knowledge_chunks")
      .select("id, title, source_kind, source_id, company_id")
      .order("created_at", { ascending: false })
      .limit(4000)
      .returns<Chunk[]>();
    if (error) { setErr(error.message); setChunks([]); return; }
    setChunks(data ?? []);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  const groups: Group[] = useMemo(() => {
    const map = new Map<string, Group>();
    for (const c of chunks ?? []) {
      const scope = c.company_id === null ? "global" : "company";
      const label = c.title?.trim() || c.source_id || "(untitled)";
      const key = `${c.company_id ?? "global"}::${c.source_id ?? `t:${label}`}`;
      const g = map.get(key);
      if (g) { g.ids.push(c.id); }
      else {
        map.set(key, {
          key, scope, companyId: c.company_id, sourceId: c.source_id,
          title: label, kind: c.source_kind, ids: [c.id],
        });
      }
    }
    return [...map.values()].sort((a, b) => {
      if (a.scope !== b.scope) return a.scope === "global" ? -1 : 1;
      return a.title.localeCompare(b.title);
    });
  }, [chunks]);

  async function remove(g: Group) {
    const label = g.scope === "global" ? "the GLOBAL brain (ALL companies)" : companyName(g.companyId);
    if (!confirm(`Delete "${g.title}" (${g.ids.length} fact${g.ids.length === 1 ? "" : "s"}) from ${label}? This can't be undone.`)) return;
    setBusyKey(g.key); setErr(null);
    // RLS enforces who may delete what. Delete by source_id when present (clean),
    // else by the explicit id list.
    let query = supabase.from("knowledge_chunks").delete();
    if (g.sourceId) {
      query = query.eq("source_id", g.sourceId);
      query = g.companyId === null ? query.is("company_id", null) : query.eq("company_id", g.companyId);
    } else {
      query = query.in("id", g.ids);
    }
    const { error } = await query;
    setBusyKey(null);
    if (error) { setErr(error.message); return; }
    setChunks((cur) => (cur ?? []).filter((c) => !g.ids.includes(c.id)));
  }

  const wrap: CSSProperties = { marginTop: 20, background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: 16, padding: 20 };
  const row: CSSProperties = { display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderTop: "1px solid var(--border)" };
  const tag: CSSProperties = { fontSize: 11, padding: "2px 8px", borderRadius: 999, background: "rgba(255,255,255,0.06)", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em" };

  return (
    <div style={wrap}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <strong style={{ fontSize: 16, color: "#fff" }}>🗂️ Trained knowledge</strong>
        <button onClick={load} style={{ fontSize: 13 }}>Refresh</button>
      </div>
      <p className="subtitle" style={{ marginTop: 2 }}>
        Everything the AI has learned, grouped by source. Delete anything you don&apos;t want it quoting.
        {isSuper ? " You can remove global (all-company) knowledge too." : " Global knowledge is managed by the platform admin."}
      </p>

      {err && <div className="error" style={{ marginTop: 8 }}>{err}</div>}

      {chunks === null ? (
        <div className="subtitle" style={{ padding: "14px 0" }}>Loading…</div>
      ) : groups.length === 0 ? (
        <div className="empty" style={{ marginTop: 10 }}>Nothing trained yet.</div>
      ) : (
        <div style={{ marginTop: 8 }}>
          {groups.map((g) => {
            const canDelete = g.scope === "company" || isSuper;
            return (
              <div key={g.key} style={row}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: "#fff", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{g.title}</div>
                  <div style={{ display: "flex", gap: 8, marginTop: 4, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={tag}>{g.kind}</span>
                    <span style={{ fontSize: 12, color: g.scope === "global" ? "#10b981" : "var(--muted)" }}>{companyName(g.companyId)}</span>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>{g.ids.length} fact{g.ids.length === 1 ? "" : "s"}</span>
                  </div>
                </div>
                <button
                  onClick={() => remove(g)}
                  disabled={!canDelete || busyKey === g.key}
                  title={canDelete ? "Delete this source" : "Global knowledge is super-admin only"}
                  style={{ color: canDelete ? "#ef4444" : "var(--muted)", borderColor: canDelete ? "rgba(239,68,68,0.4)" : "var(--border)", opacity: canDelete ? 1 : 0.5, whiteSpace: "nowrap" }}
                >
                  {busyKey === g.key ? "Deleting…" : "Delete"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
