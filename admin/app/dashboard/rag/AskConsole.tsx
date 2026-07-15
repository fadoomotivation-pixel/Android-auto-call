"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Source = { title: string | null; kind: string; similarity: number; snippet: string };
type Answer = {
  answer: string;
  confidence: "high" | "medium" | "low" | "none";
  sources: Source[];
  engine?: "fable" | "groq";
  model?: string;
  reasoning?: string;
};

const CONF: Record<string, { label: string; color: string; bg: string }> = {
  high:   { label: "High confidence",   color: "#10b981", bg: "rgba(16,185,129,0.12)" },
  medium: { label: "Medium confidence", color: "#f59e0b", bg: "rgba(245,158,11,0.12)" },
  low:    { label: "Low confidence",    color: "#f97316", bg: "rgba(249,115,22,0.12)" },
  none:   { label: "Not in knowledge",  color: "#94a3b8", bg: "rgba(148,163,184,0.12)" },
};

/**
 * RAG v8 — the glass box with a Claude Fable 5 brain. Ask the company's AI
 * anything and watch it show its working: the answer, an honest confidence
 * badge, a peek at how Fable *reasoned*, and the exact source facts it used with
 * match scores. Nothing hidden — the demo-day "wow".
 */
export function AskConsole() {
  const supabase = createClient();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Answer | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showReasoning, setShowReasoning] = useState(false);

  async function ask() {
    if (!q.trim()) return;
    setBusy(true); setErr(null); setRes(null);
    const { data, error } = await supabase.functions.invoke("rag-ask", { body: { question: q } });
    setBusy(false);
    setShowReasoning(false);
    if (error || (data && (data as { ok?: boolean }).ok === false)) {
      setErr(error?.message ?? (data as { error?: string })?.error ?? "Something went wrong");
      return;
    }
    setRes(data as Answer);
  }

  const conf = res ? CONF[res.confidence] : null;

  return (
    <div className="card" style={{ marginTop: 4, marginBottom: 20, background: "rgba(255,255,255,0.015)", border: "1px solid var(--border)", borderRadius: 16, padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <strong style={{ fontSize: 16, color: "#fff" }}>💬 Ask your company&apos;s AI</strong>
        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.03em", textTransform: "uppercase", color: "#c4b5fd", background: "rgba(139,92,246,0.14)", border: "1px solid rgba(139,92,246,0.3)", padding: "2px 8px", borderRadius: 999 }}>
          ✦ Claude Fable 5
        </span>
      </div>
      <p className="subtitle" style={{ marginTop: 2 }}>
        See exactly what it knows — how it reasoned, how sure it is, and the source facts it used.
      </p>

      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void ask(); }}
          placeholder="e.g. What's the 2BHK price in Sector 150? What's our loan tie-up?"
          style={{ flex: 1, minWidth: 240, padding: "11px 14px", borderRadius: 10, border: "1px solid var(--border)", background: "rgba(255,255,255,0.02)", color: "var(--text)", outline: "none" }}
        />
        <button className="primary" style={{ width: "auto", padding: "11px 22px" }} disabled={busy || !q.trim()} onClick={ask}>
          {busy ? "Thinking…" : "Ask"}
        </button>
      </div>

      {err && <div className="error" style={{ marginTop: 10 }}>{err}</div>}

      {res && conf && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 12px", borderRadius: 999, background: conf.bg, color: conf.color, fontWeight: 700, fontSize: 12 }}>
              ● {conf.label}
            </div>
            {res.engine && res.confidence !== "none" && (
              <span style={{ fontSize: 11.5, color: "var(--muted)" }}>
                answered by {res.engine === "fable" ? "Claude Fable 5 ✦" : "Llama 3.3 (fallback)"}
              </span>
            )}
          </div>
          <div style={{ marginTop: 10, fontSize: 15, lineHeight: 1.6, color: "rgba(255,255,255,0.9)", whiteSpace: "pre-wrap" }}>
            {res.answer}
          </div>

          {res.engine === "fable" && res.reasoning && (
            <div style={{ marginTop: 12 }}>
              <button
                onClick={() => setShowReasoning((v) => !v)}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 8, border: "1px solid rgba(139,92,246,0.3)", background: "rgba(139,92,246,0.08)", color: "#c4b5fd", fontSize: 12, fontWeight: 600, cursor: "pointer", width: "auto" }}
              >
                🧠 {showReasoning ? "Hide" : "See"} how Fable reasoned
              </button>
              {showReasoning && (
                <div style={{ marginTop: 8, padding: "12px 14px", borderRadius: 10, background: "rgba(139,92,246,0.05)", border: "1px solid rgba(139,92,246,0.18)", fontSize: 13, lineHeight: 1.55, color: "rgba(255,255,255,0.75)", whiteSpace: "pre-wrap" }}>
                  {res.reasoning}
                </div>
              )}
            </div>
          )}

          {res.sources.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)", marginBottom: 8 }}>
                Facts it used — with match score
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {res.sources.map((s, i) => (
                  <div key={i} style={{ padding: "10px 12px", borderRadius: 10, background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 11, textTransform: "uppercase", color: "#a5b4fc", background: "rgba(99,102,241,0.12)", padding: "2px 8px", borderRadius: 999 }}>{s.kind}</span>
                      <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title || "Untitled"}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: s.similarity >= 60 ? "#10b981" : s.similarity >= 42 ? "#f59e0b" : "#f97316" }}>{s.similarity}%</span>
                    </div>
                    <div style={{ height: 5, borderRadius: 999, background: "rgba(255,255,255,0.08)", overflow: "hidden", marginBottom: 6 }}>
                      <div style={{ height: "100%", width: `${s.similarity}%`, background: s.similarity >= 60 ? "#10b981" : s.similarity >= 42 ? "#f59e0b" : "#f97316" }} />
                    </div>
                    <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.4 }}>{s.snippet}…</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {res.confidence === "none" && (
            <div style={{ marginTop: 10, fontSize: 13, color: "var(--muted)" }}>
              Tip: teach it under <strong>AI Coach → AI Knowledge base</strong>, then ask again.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
