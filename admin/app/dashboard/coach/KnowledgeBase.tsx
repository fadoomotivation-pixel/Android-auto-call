"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Chunk = { id: string; title: string | null; source_kind: string; created_at: string };

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
  const [msg, setMsg] = useState<string | null>(null);
  const [items, setItems] = useState<Chunk[]>([]);
  const [count, setCount] = useState(0);

  async function load() {
    const { data, count: c } = await supabase
      .from("knowledge_chunks")
      .select("id, title, source_kind, created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .limit(20);
    setItems((data as Chunk[]) ?? []);
    setCount(c ?? 0);
  }
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
