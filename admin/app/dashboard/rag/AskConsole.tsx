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
  high:   { label: "High confidence",   color: "var(--good)", bg: "rgba(16,185,129,0.12)" },
  medium: { label: "Medium confidence", color: "var(--warn)", bg: "rgba(245,158,11,0.12)" },
  low:    { label: "Low confidence",    color: "var(--warn)", bg: "rgba(249,115,22,0.12)" },
  none:   { label: "Not in knowledge",  color: "var(--muted)", bg: "rgba(148,163,184,0.12)" },
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
    <div className="card" style={{ marginTop: 4, marginBottom: 20, background: "var(--tint)", border: "1px solid var(--border)", borderRadius: 16, padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <strong style={{ fontSize: "var(--text-callout)", color: "var(--text)" }}>💬 Ask your company&apos;s AI</strong>
        <span style={{ fontSize: "var(--text-caption2)", fontWeight: "var(--weight-bold)", letterSpacing: "0.03em", textTransform: "uppercase", color: "var(--purple)", background: "rgba(139,92,246,0.14)", border: "1px solid rgba(139,92,246,0.3)", padding: "2px 8px", borderRadius: 999 }}>
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
          style={{ flex: 1, minWidth: 240, padding: "11px 14px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--tint)", color: "var(--text)", outline: "none" }}
        />
        <button className="primary" style={{ width: "auto", padding: "11px 22px" }} disabled={busy || !q.trim()} onClick={ask}>
          {busy ? "Thinking…" : "Ask"}
        </button>
      </div>

      {err && <div className="error" style={{ marginTop: 10 }}>{err}</div>}

      {res && conf && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 12px", borderRadius: 999, background: conf.bg, color: conf.color, fontWeight: "var(--weight-bold)", fontSize: "var(--text-caption1)" }}>
              ● {conf.label}
            </div>
            {res.engine && res.confidence !== "none" && (
              <span style={{ fontSize: "var(--text-caption2)", color: "var(--muted)" }}>
                answered by {res.engine === "fable" ? "Claude Fable 5 ✦" : "Llama 3.3 (fallback)"}
              </span>
            )}
          </div>
          <div style={{ marginTop: 10, fontSize: "var(--text-subheadline)", lineHeight: 1.6, color: "rgba(255,255,255,0.9)", whiteSpace: "pre-wrap" }}>
            {res.answer}
          </div>

          {res.engine === "fable" && res.reasoning && (
            <div style={{ marginTop: 12 }}>
              <button
                onClick={() => setShowReasoning((v) => !v)}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 8, border: "1px solid rgba(139,92,246,0.3)", background: "rgba(139,92,246,0.08)", color: "var(--purple)", fontSize: "var(--text-caption1)", fontWeight: "var(--weight-semibold)", cursor: "pointer", width: "auto" }}
              >
                🧠 {showReasoning ? "Hide" : "See"} how Fable reasoned
              </button>
              {showReasoning && (
                <div style={{ marginTop: 8, padding: "12px 14px", borderRadius: 12, background: "rgba(139,92,246,0.05)", border: "1px solid rgba(139,92,246,0.18)", fontSize: "var(--text-footnote)", lineHeight: 1.55, color: "rgba(255,255,255,0.75)", whiteSpace: "pre-wrap" }}>
                  {res.reasoning}
                </div>
              )}
            </div>
          )}

          {res.sources.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: "var(--text-caption1)", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)", marginBottom: 8 }}>
                Facts it used — with match score
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {res.sources.map((s, i) => (
                  <div key={i} style={{ padding: "10px 12px", borderRadius: 12, background: "var(--tint)", border: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: "var(--text-caption2)", textTransform: "uppercase", color: "var(--accent)", background: "rgba(99,102,241,0.12)", padding: "2px 8px", borderRadius: 999 }}>{s.kind}</span>
                      <span style={{ flex: 1, fontSize: "var(--text-footnote)", fontWeight: "var(--weight-semibold)", color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title || "Untitled"}</span>
                      <span style={{ fontSize: "var(--text-caption1)", fontWeight: "var(--weight-bold)", color: s.similarity >= 60 ? "var(--good)" : s.similarity >= 42 ? "var(--warn)" : "var(--warn)" }}>{s.similarity}%</span>
                    </div>
                    <div style={{ height: 5, borderRadius: 999, background: "var(--tint)", overflow: "hidden", marginBottom: 6 }}>
                      <div style={{ height: "100%", width: `${s.similarity}%`, background: s.similarity >= 60 ? "var(--good)" : s.similarity >= 42 ? "var(--warn)" : "var(--warn)" }} />
                    </div>
                    <div style={{ fontSize: "var(--text-caption1)", color: "var(--muted)", lineHeight: 1.4 }}>{s.snippet}…</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {res.confidence === "none" && (
            <div style={{ marginTop: 10, fontSize: "var(--text-footnote)", color: "var(--muted)" }}>
              Tip: teach it under <strong>AI Coach → AI Knowledge base</strong>, then ask again.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
