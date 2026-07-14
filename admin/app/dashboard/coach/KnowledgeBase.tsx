"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Chunk = { id: string; title: string | null; source_kind: string; created_at: string };
type Gap = { id: string; question: string; ask_count: number };

const KINDS = [
  { key: "brochure", label: "Brochure" },
  { key: "price", label: "Price list" },
  { key: "faq", label: "FAQ / objection" },
  { key: "note", label: "Note" },
];

/**
 * The RAG knowledge base. An admin pastes the company's real material — price
 * lists, project brochures, FAQ answers — and the AI Coach starts quoting it
 * instead of guessing. Ingestion embeds on the Supabase edge (free).
 */
export function KnowledgeBase() {
  const supabase = createClient();
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("price");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [items, setItems] = useState<Chunk[]>([]);
  const [count, setCount] = useState(0);
  const [gaps, setGaps] = useState<Gap[]>([]);

  async function load() {
    const [{ data, count: c }, { data: g }] = await Promise.all([
      supabase.from("knowledge_chunks")
        .select("id, title, source_kind, created_at", { count: "exact" })
        .order("created_at", { ascending: false }).limit(20),
      supabase.from("knowledge_gaps")
        .select("id, question, ask_count").eq("resolved", false)
        .order("ask_count", { ascending: false }).limit(10),
    ]);
    setItems((data as Chunk[]) ?? []);
    setCount(c ?? 0);
    setGaps((g as Gap[]) ?? []);
  }
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function dismissGap(id: string) {
    await supabase.from("knowledge_gaps").update({ resolved: true }).eq("id", id);
    void load();
  }
  function answerGap(g: Gap) {
    setTitle(g.question.slice(0, 80));
    setKind("faq");
    setText((t) => (t ? t : `Q: ${g.question}\nA: `));
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function ingest() {
    if (!text.trim()) return;
    setBusy(true);
    setMsg(null);
    const { data, error } = await supabase.functions.invoke("knowledge-ingest", {
      body: { title: title.trim() || null, source_kind: kind, source_id: null, text },
    });
    setBusy(false);
    if (error || (data && (data as { ok?: boolean }).ok === false)) {
      setMsg(`Couldn't save: ${error?.message ?? (data as { error?: string })?.error ?? "unknown"}`);
      return;
    }
    const stored = (data as { stored?: number })?.stored ?? 0;
    setMsg(`✓ Added ${stored} knowledge chunk${stored === 1 ? "" : "s"}. The coach can use it now.`);
    setText("");
    setTitle("");
    void load();
  }

  async function remove(id: string) {
    await supabase.from("knowledge_chunks").delete().eq("id", id);
    void load();
  }

  // RAG v2 — the base builds itself from the company's OWN proven material:
  // won-deal call transcripts + the content library. One tap, no typing.
  async function learnFromData() {
    setSyncing(true);
    setMsg(null);
    const { data, error } = await supabase.functions.invoke("knowledge-sync", { body: {} });
    setSyncing(false);
    if (error || (data && (data as { ok?: boolean }).ok === false)) {
      setMsg(`Sync failed: ${error?.message ?? (data as { error?: string })?.error ?? "unknown"}`);
      return;
    }
    const d = data as { sources?: number; stored?: number };
    setMsg(`✓ Learned from ${d.sources ?? 0} source${d.sources === 1 ? "" : "s"} (${d.stored ?? 0} chunks) — your won calls & library.`);
    void load();
  }

  const card: React.CSSProperties = { background: "rgba(255,255,255,0.015)", border: "1px solid var(--border)", borderRadius: 16, padding: 20, marginBottom: 20 };
  const input: React.CSSProperties = { padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "rgba(255,255,255,0.02)", color: "var(--text)", outline: "none" };

  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <strong style={{ fontSize: 16, color: "#fff" }}>📚 AI Knowledge base</strong>
        <span style={{ fontSize: 13, color: "var(--muted)" }}>{count} chunk{count === 1 ? "" : "s"} learned</span>
      </div>
      <p className="subtitle" style={{ marginTop: 4 }}>
        Paste your real prices, project details and FAQ answers. The AI Coach will quote these facts to your team instead of guessing.
      </p>

      {/* RAG v3 — active learning: questions the AI COULDN'T answer, ranked by
          how often the team asked. Answer one and the coach knows it forever. */}
      {gaps.length > 0 && (
        <div style={{ marginTop: 14, padding: 14, borderRadius: 12, background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.25)" }}>
          <strong style={{ color: "#f59e0b", fontSize: 14 }}>🧩 Your team asked — the AI didn&apos;t know</strong>
          <p className="subtitle" style={{ marginTop: 2 }}>Answer these and the coach will have them forever.</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
            {gaps.map((g) => (
              <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 10, background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#f59e0b", minWidth: 34 }}>{g.ask_count}×</span>
                <span style={{ flex: 1, fontSize: 13, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.question}</span>
                <button className="link" style={{ fontSize: 12, color: "#10b981", fontWeight: 600 }} onClick={() => answerGap(g)}>Answer</button>
                <button className="link" style={{ fontSize: 12, color: "var(--muted)" }} onClick={() => dismissGap(g.id)}>Dismiss</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* RAG v2 — knowledge that builds itself from won calls + the library. */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14, flexWrap: "wrap" }}>
        <button
          onClick={learnFromData}
          disabled={syncing}
          style={{ padding: "9px 16px", borderRadius: 10, border: "1px solid rgba(16,185,129,0.35)", background: "rgba(16,185,129,0.10)", color: "#10b981", fontWeight: 600, cursor: syncing ? "default" : "pointer" }}
        >
          {syncing ? "Learning from your data…" : "✨ Learn from my won calls + library"}
        </button>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>
          Auto-builds knowledge from deals that actually closed — no typing.
        </span>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        <input placeholder="Title (e.g. Sector 150 price list)" value={title} onChange={(e) => setTitle(e.target.value)} style={{ ...input, flex: 1, minWidth: 200 }} />
        <select value={kind} onChange={(e) => setKind(e.target.value)} style={input}>
          {KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
        </select>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={"Paste the facts here…\n\ne.g. Sector 150 Noida — 2BHK from ₹62L, 3BHK from ₹88L. Possession Dec 2026. Home loan tie-up with HDFC/SBI, ~₹48k EMI on 2BHK. Free modular kitchen this month."}
        style={{ ...input, width: "100%", minHeight: 130, marginTop: 8, fontFamily: "inherit", lineHeight: 1.5 }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10 }}>
        <button className="primary" style={{ width: "auto", padding: "9px 18px" }} disabled={busy || !text.trim()} onClick={ingest}>
          {busy ? "Teaching the AI…" : "Add to knowledge"}
        </button>
        {msg && <span style={{ fontSize: 13, color: msg.startsWith("✓") ? "#10b981" : "#ef4444" }}>{msg}</span>}
      </div>

      {items.length > 0 && (
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 6 }}>
          {items.map((it) => (
            <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 10, background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)" }}>
              <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", color: "#a5b4fc", background: "rgba(99,102,241,0.12)", padding: "2px 8px", borderRadius: 999 }}>{it.source_kind}</span>
              <span style={{ flex: 1, fontSize: 13, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.title || "Untitled"}</span>
              <button className="link" style={{ fontSize: 12, color: "#ef4444" }} onClick={() => remove(it.id)}>Remove</button>
            </div>
          ))}
          {count > items.length && <span style={{ fontSize: 12, color: "var(--muted)" }}>Showing latest 20 of {count}.</span>}
        </div>
      )}
    </div>
  );
}
