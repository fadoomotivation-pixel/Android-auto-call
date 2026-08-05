"use client";

/**
 * Everything the AI has learned — and the ability to correct it.
 *
 * Before this, knowledge could only be added or deleted. A wrong price meant
 * deleting the whole brochure and re-uploading it, so in practice nobody did:
 * the wrong price stayed, and the coach kept quoting it.
 *
 * WHY EDITING GOES THROUGH THE EDGE FUNCTION AND NOT A DIRECT UPDATE. Each fact
 * carries a 384-dimension embedding, and match_knowledge() searches ONLY that
 * vector — never the text on screen. Writing new wording straight to `content`
 * from here would leave the old vector in place: this list would show the
 * correction, the AI would keep answering with the original, and neither would
 * report an error. So Save calls knowledge-ingest with mode:'edit', which
 * re-embeds the new text and writes text + vector in one statement. Slower, and
 * it is the only version that is actually true.
 *
 * Scope is shown on every row because it changes who is affected: a global fact
 * is in EVERY company's brain, a company fact is in one. Same rule as delete —
 * global is the platform admin's alone, enforced by RLS and re-checked inside
 * the edge function (which uses a service key and so bypasses RLS).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { createClient } from "@/lib/supabase/client";
import { ago, ist } from "@/lib/dashboard/format";

type Company = { id: string; name: string | null };

interface Chunk {
  id: string;
  title: string | null;
  content: string;
  source_kind: string;
  source_id: string | null;
  company_id: string | null;
  created_at: string;
  updated_at: string | null;
}

interface Group {
  key: string;
  scope: "global" | "company";
  companyId: string | null;
  sourceId: string | null;
  title: string;
  kind: string;
  facts: Chunk[];
  /** Most recent correction (or creation) anywhere in this source. */
  touchedAt: string;
}

/** Where a fact came from, in words a person recognises. */
const KIND_LABEL: Record<string, string> = {
  brochure: "Brochure",
  price: "Price list",
  faq: "FAQ",
  call: "Call",
  note: "Note",
  guide: "Guidebook",
  offer: "Offer",
  win: "Won deal",
};

export function KnowledgeManager({ isSuper, companies }: { isSuper: boolean; companies: Company[] }) {
  const supabase = useMemo(() => createClient(), []);
  const [chunks, setChunks] = useState<Chunk[] | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);

  // The fact being corrected, and its working text. One at a time — an edit box
  // per row invites half-finished edits scrolling off screen.
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  const companyName = useMemo(() => {
    const m = new Map(companies.map((c) => [c.id, c.name ?? "Company"]));
    return (id: string | null) => (id ? m.get(id) ?? "Company" : "🌐 Global — all companies");
  }, [companies]);

  const load = useCallback(async () => {
    setErr(null);
    const { data, error } = await supabase
      .from("knowledge_chunks")
      .select("id, title, content, source_kind, source_id, company_id, created_at, updated_at")
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
      const touched = c.updated_at ?? c.created_at;
      const g = map.get(key);
      if (g) {
        g.facts.push(c);
        if (touched > g.touchedAt) g.touchedAt = touched;
      } else {
        map.set(key, {
          key, scope, companyId: c.company_id, sourceId: c.source_id,
          title: label, kind: c.source_kind, facts: [c], touchedAt: touched,
        });
      }
    }
    return [...map.values()].sort((a, b) => {
      if (a.scope !== b.scope) return a.scope === "global" ? -1 : 1;
      return a.title.localeCompare(b.title);
    });
  }, [chunks]);

  /** Same rule as delete: your own company always, global only as super admin. */
  const mayWrite = (g: Group) => g.scope === "company" || isSuper;

  async function remove(g: Group) {
    const label = g.scope === "global" ? "the GLOBAL brain (ALL companies)" : companyName(g.companyId);
    if (!confirm(`Delete "${g.title}" (${g.facts.length} fact${g.facts.length === 1 ? "" : "s"}) from ${label}? This can't be undone.`)) return;
    setBusyKey(g.key); setErr(null);
    // RLS enforces who may delete what. Delete by source_id when present (clean),
    // else by the explicit id list.
    const ids = g.facts.map((f) => f.id);
    let query = supabase.from("knowledge_chunks").delete();
    if (g.sourceId) {
      query = query.eq("source_id", g.sourceId);
      query = g.companyId === null ? query.is("company_id", null) : query.eq("company_id", g.companyId);
    } else {
      query = query.in("id", ids);
    }
    const { error } = await query;
    setBusyKey(null);
    if (error) { setErr(error.message); return; }
    setChunks((cur) => (cur ?? []).filter((c) => !ids.includes(c.id)));
  }

  function startEdit(f: Chunk) {
    setEditId(f.id); setDraft(f.content); setSaveErr(null); setSavedId(null);
  }

  async function saveEdit(f: Chunk) {
    const content = draft.trim();
    if (!content) { setSaveErr("A fact can't be empty. Delete it instead."); return; }
    if (content === f.content) { setEditId(null); return; }
    setSaving(true); setSaveErr(null);

    // mode:'edit' re-embeds. Never write `content` directly from here — see the
    // note at the top of this file.
    const { data, error } = await supabase.functions.invoke("knowledge-ingest", {
      body: { mode: "edit", id: f.id, content },
    });
    setSaving(false);

    const res = data as { ok?: boolean; error?: string } | null;
    if (error || !res?.ok) {
      setSaveErr(res?.error || (error instanceof Error ? error.message : "Could not save. Nothing was changed."));
      return;
    }

    const now = new Date().toISOString();
    setChunks((cur) => (cur ?? []).map((c) => (c.id === f.id ? { ...c, content, updated_at: now } : c)));
    setEditId(null); setSavedId(f.id);
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
        Everything the AI has learned, grouped by source. Open a source to fix a wrong fact, or delete
        the whole thing. Editing re-teaches the AI straight away, so it stops quoting the old wording.
        {isSuper
          ? " 🌐 Global sources sit in every company's brain — only you can change those."
          : " Global knowledge is managed by the platform admin."}
      </p>

      {err && <div className="error" style={{ marginTop: 8 }}>{err}</div>}

      {chunks === null ? (
        <div className="subtitle" style={{ padding: "14px 0" }}>Loading…</div>
      ) : groups.length === 0 ? (
        <div className="empty" style={{ marginTop: 10 }}>Nothing trained yet.</div>
      ) : (
        <div style={{ marginTop: 8 }}>
          {groups.map((g) => {
            const canWrite = mayWrite(g);
            const isOpen = openKey === g.key;
            return (
              <div key={g.key} style={{ borderTop: "1px solid var(--border)" }}>
                <div style={{ ...row, borderTop: "none" }}>
                  <button
                    onClick={() => setOpenKey(isOpen ? null : g.key)}
                    aria-expanded={isOpen}
                    style={{
                      flex: 1, minWidth: 0, textAlign: "left", background: "transparent",
                      border: "none", padding: 0, cursor: "pointer", color: "inherit",
                    }}
                  >
                    <div style={{ color: "#fff", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      <span style={{ color: "var(--muted)", marginRight: 6 }}>{isOpen ? "▾" : "▸"}</span>
                      {g.title}
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 4, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={tag}>{KIND_LABEL[g.kind] ?? g.kind}</span>
                      <span style={{
                        fontSize: 12, fontWeight: g.scope === "global" ? 600 : 400,
                        color: g.scope === "global" ? "#10b981" : "var(--muted)",
                      }}>
                        {companyName(g.companyId)}
                      </span>
                      <span style={{ fontSize: 12, color: "var(--muted)" }}>
                        {g.facts.length} fact{g.facts.length === 1 ? "" : "s"}
                      </span>
                      <span style={{ fontSize: 12, color: "var(--muted)" }} title={ist(g.touchedAt)}>
                        updated {ago(g.touchedAt)}
                      </span>
                    </div>
                  </button>
                  <button
                    onClick={() => remove(g)}
                    disabled={!canWrite || busyKey === g.key}
                    title={canWrite ? "Delete this source" : "Global knowledge is super-admin only"}
                    style={{ color: canWrite ? "#ef4444" : "var(--muted)", borderColor: canWrite ? "rgba(239,68,68,0.4)" : "var(--border)", opacity: canWrite ? 1 : 0.5, whiteSpace: "nowrap" }}
                  >
                    {busyKey === g.key ? "Deleting…" : "Delete"}
                  </button>
                </div>

                {isOpen && (
                  <div style={{ padding: "0 0 12px 18px" }}>
                    {g.sourceId && (
                      <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 8 }}>
                        Source: <code style={{ fontSize: 11.5 }}>{g.sourceId}</code>
                      </div>
                    )}
                    {g.facts.map((f, i) => {
                      const editing = editId === f.id;
                      return (
                        <div key={f.id} style={{
                          padding: "9px 11px", marginBottom: 6, borderRadius: 10,
                          background: "rgba(255,255,255,0.025)",
                          border: "1px solid rgba(255,255,255,0.07)",
                        }}>
                          <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                            <span style={{ fontSize: 11, color: "var(--muted)", minWidth: 22 }}>#{i + 1}</span>
                            {editing ? (
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <textarea
                                  value={draft}
                                  onChange={(e) => setDraft(e.target.value)}
                                  rows={Math.min(12, Math.max(3, Math.ceil(draft.length / 90)))}
                                  autoFocus
                                  style={{
                                    width: "100%", fontSize: 13, lineHeight: 1.6, padding: 9,
                                    borderRadius: 8, background: "rgba(0,0,0,0.28)", color: "var(--text)",
                                    border: "1px solid rgba(255,255,255,0.16)", resize: "vertical",
                                  }}
                                />
                                <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 7, flexWrap: "wrap" }}>
                                  <button onClick={() => void saveEdit(f)} disabled={saving} style={{ fontSize: 12.5 }}>
                                    {saving ? "Re-teaching the AI…" : "Save & re-teach"}
                                  </button>
                                  <button onClick={() => { setEditId(null); setSaveErr(null); }} disabled={saving} style={{ fontSize: 12.5 }}>
                                    Cancel
                                  </button>
                                  <span style={{ fontSize: 11.5, color: "var(--muted)" }}>
                                    {draft.trim().length} characters
                                    {g.scope === "global" ? " · this changes every company's brain" : ""}
                                  </span>
                                </div>
                                {saveErr && <div className="error" style={{ marginTop: 7, fontSize: 12.5 }}>{saveErr}</div>}
                              </div>
                            ) : (
                              <>
                                <div style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                                  {f.content}
                                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                                    {f.updated_at && f.updated_at !== f.created_at
                                      ? `Corrected ${ago(f.updated_at)}`
                                      : `Learned ${ago(f.created_at)}`}
                                    {savedId === f.id && (
                                      <span style={{ color: "#10b981" }}> · ✅ AI re-taught</span>
                                    )}
                                  </div>
                                </div>
                                <button
                                  onClick={() => startEdit(f)}
                                  disabled={!canWrite}
                                  title={canWrite ? "Fix this fact and re-teach the AI" : "Global knowledge is super-admin only"}
                                  style={{ fontSize: 12, whiteSpace: "nowrap", opacity: canWrite ? 1 : 0.5 }}
                                >
                                  Edit
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
