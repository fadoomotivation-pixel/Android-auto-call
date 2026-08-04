import type { CSSProperties } from "react";
import { resolveScope } from "@/lib/dashboard/scope";
import { ModuleLinks } from "../ModuleLinks";
import { istDate } from "@/lib/dashboard/format";
import { AskConsole } from "./AskConsole";
import { KnowledgeTrainer } from "./KnowledgeTrainer";
import { KnowledgeManager } from "./KnowledgeManager";

type Stat = {
  company_id: string;
  company_name: string | null;
  chunks: number;
  brochures: number;
  prices: number;
  faqs: number;
  calls: number;
  notes: number;
  open_gaps: number;
  last_learned: string | null;
};

function health(s: Stat): { label: string; color: string } {
  if (s.chunks === 0) return { label: "Empty", color: "#ef4444" };
  if (s.chunks < 8) return { label: "Getting started", color: "#f59e0b" };
  if (s.open_gaps > 5) return { label: "Needs answers", color: "#f59e0b" };
  return { label: "Healthy", color: "#10b981" };
}

/**
 * RAG — the "AI Brain" control room. Shows every company's knowledge base at a
 * glance so the super-admin can see who's set up, who's empty, and where the AI
 * keeps hitting gaps. Aggregate-only (via rag_stats RPC) — no company's actual
 * knowledge is ever shown to another.
 */
export default async function RagPage({
  searchParams,
}: { searchParams: Promise<{ company?: string }> }) {
  const scope = await resolveScope(await searchParams, { require: "any" });
  const { supabase, isSuper } = scope;
  if (scope.role !== "admin" && !isSuper) {
    return <><h2>RAG</h2><div className="empty">Managers only.</div></>;
  }

  const { data, error } = await supabase.rpc("rag_stats");
  const rows = (data as Stat[] | null) ?? [];

  // The shared global brain lives in company_id-NULL rows, so it isn't part of
  // any company's rag_stats group. Count it separately (RLS lets everyone read
  // the global layer, so this head-count is safe).
  const { count: globalChunks } = await supabase
    .from("knowledge_chunks")
    .select("id", { count: "exact", head: true })
    .is("company_id", null);

  const totalChunks = rows.reduce((a, r) => a + Number(r.chunks), 0);
  const totalGaps = rows.reduce((a, r) => a + Number(r.open_gaps), 0);
  const liveCompanies = rows.filter((r) => Number(r.chunks) > 0).length;
  const companies = rows.map((r) => ({ id: r.company_id, name: r.company_name }));

  const stat: CSSProperties = { background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: 14, padding: "16px 20px", flex: 1, minWidth: 150 };
  const th: CSSProperties = { textAlign: "left", padding: "10px 12px", fontSize: 11, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--muted)" };
  const td: CSSProperties = { padding: "10px 12px", borderTop: "1px solid var(--border)" };

  return (
    <>
      <h2>🧠 RAG</h2>
      <p className="subtitle">
        RAG (Retrieval-Augmented Generation) is your AI&apos;s memory. Each company teaches the AI its
        real prices, brochures and winning calls — and the coach quotes those facts instead of guessing.
        Every company&apos;s brain is fully separate; this page shows how well each one is fed.
      </p>

      {error && <div className="error" style={{ marginTop: 8 }}>{error.message}</div>}

      <KnowledgeTrainer isSuper={isSuper} companies={companies} />

      <KnowledgeManager isSuper={isSuper} companies={companies} />

      <AskConsole />

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "16px 0" }}>
        <div style={stat}>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#fff" }}>{totalChunks}</div>
          <div className="subtitle">company facts learned</div>
        </div>
        <div style={stat}>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#10b981" }}>{globalChunks ?? 0}</div>
          <div className="subtitle">🌐 global facts (shared to all)</div>
        </div>
        <div style={stat}>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#fff" }}>{liveCompanies}<span style={{ fontSize: 16, color: "var(--muted)" }}>/{rows.length}</span></div>
          <div className="subtitle">companies with a brain</div>
        </div>
        <div style={stat}>
          <div style={{ fontSize: 28, fontWeight: 800, color: totalGaps > 0 ? "#f59e0b" : "#10b981" }}>{totalGaps}</div>
          <div className="subtitle">open questions the AI couldn&apos;t answer</div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="empty">No companies yet.</div>
      ) : (
        <div className="table-responsive">
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Company</th>
                <th style={th}>Health</th>
                <th style={th}>Facts</th>
                <th style={th}>Breakdown</th>
                <th style={th}>Open gaps</th>
                <th style={th}>Last taught</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const h = health(r);
                const parts = [
                  r.prices ? `${r.prices} price` : null,
                  r.brochures ? `${r.brochures} brochure` : null,
                  r.faqs ? `${r.faqs} FAQ` : null,
                  r.calls ? `${r.calls} call` : null,
                  r.notes ? `${r.notes} note` : null,
                ].filter(Boolean).join(" · ");
                return (
                  <tr key={r.company_id}>
                    <td style={td}><strong style={{ color: "#fff" }}>{r.company_name || "—"}</strong></td>
                    <td style={td}><span style={{ color: h.color, fontWeight: 600, fontSize: 13 }}>● {h.label}</span></td>
                    <td style={td}><strong>{r.chunks}</strong></td>
                    <td style={{ ...td, fontSize: 13, color: "var(--muted)" }}>{parts || "—"}</td>
                    <td style={td}>{Number(r.open_gaps) > 0 ? <span style={{ color: "#f59e0b", fontWeight: 600 }}>{r.open_gaps}</span> : "0"}</td>
                    <td style={{ ...td, fontSize: 13, color: "var(--muted)" }}>{istDate(r.last_learned, "never")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="card" style={{ marginTop: 20, background: "rgba(99,102,241,0.05)", border: "1px solid rgba(99,102,241,0.2)" }}>
        <strong style={{ color: "#a5b4fc" }}>How to feed a company&apos;s brain</strong>
        <ol style={{ margin: "8px 0 0", paddingLeft: 20, color: "rgba(255,255,255,0.8)", lineHeight: 1.7, fontSize: 14 }}>
          <li>Open <strong>AI Coach</strong> → <strong>AI Knowledge base</strong>.</li>
          <li>Tap <strong>&ldquo;Learn from my won calls + library&rdquo;</strong> — it auto-builds from real closed deals.</li>
          <li>Paste price lists / brochures / FAQ answers for anything not captured yet.</li>
          <li>Watch <strong>&ldquo;Your team asked — the AI didn&apos;t know&rdquo;</strong> and answer the top questions.</li>
        </ol>
      </div>
      <ModuleLinks current="rag" scope={scope} />
    </>
  );
}
