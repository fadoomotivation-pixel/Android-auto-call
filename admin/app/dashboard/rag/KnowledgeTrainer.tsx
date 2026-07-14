"use client";

import { useState } from "react";
import type { ChangeEvent, CSSProperties } from "react";
import { createClient } from "@/lib/supabase/client";

type Company = { id: string; name: string | null };
type Scope = "global" | "company";

const KINDS: { value: string; label: string }[] = [
  { value: "guide", label: "Book / Article / Guide" },
  { value: "price", label: "Price sheet" },
  { value: "offer", label: "Offer / Scheme" },
  { value: "brochure", label: "Brochure" },
  { value: "faq", label: "FAQ" },
  { value: "note", label: "Note" },
];

/**
 * RAG v7 — the super-admin trainer. Two ways to teach the AI:
 *   • GLOBAL brain — a general real-estate book / article that every company's
 *     AI can draw on. Trained once, shared to all. Super-admin only.
 *   • COMPANY brain — a single company's own price sheet / offer / brochure.
 *     Stays private to that company (never leaks to another).
 * PDFs are read right in the browser (pdf.js); if that ever fails you can paste
 * the text instead — the AI learns exactly the same way.
 */
export function KnowledgeTrainer({ isSuper, companies }: { isSuper: boolean; companies: Company[] }) {
  const supabase = createClient();
  const [scope, setScope] = useState<Scope>(isSuper ? "global" : "company");
  const [companyId, setCompanyId] = useState<string>(companies[0]?.id ?? "");
  const [kind, setKind] = useState<string>("guide");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    setMsg(null);
    setFileName(file.name);
    if (!title) setTitle(file.name.replace(/\.(pdf|txt)$/i, ""));

    // Plain text — read directly.
    if (file.type === "text/plain" || file.name.toLowerCase().endsWith(".txt")) {
      setText(await file.text());
      return;
    }

    // PDF — extract text in the browser so nothing is uploaded raw.
    setReading(true);
    try {
      const pdfjs = await import("pdfjs-dist");
      // The worker is copied into /public by the copy-pdf-worker script, so it's
      // served from our own origin — webpack never has to bundle/parse the .mjs.
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      const buf = await file.arrayBuffer();
      const doc = await pdfjs.getDocument({ data: buf }).promise;
      let out = "";
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        out += content.items.map((it) => ("str" in it ? it.str : "")).join(" ") + "\n";
      }
      const clean = out.replace(/[ \t]+/g, " ").trim();
      if (!clean) throw new Error("no-text");
      setText(clean);
    } catch (_e) {
      setMsg({ ok: false, text: "Couldn't read that PDF in the browser (it may be scanned/image-only). Paste the text below instead." });
    } finally {
      setReading(false);
    }
  }

  async function train() {
    const body = text.trim();
    if (body.length < 20) { setMsg({ ok: false, text: "Add at least a paragraph of text (or upload a PDF)." }); return; }
    if (scope === "company" && isSuper && !companyId) { setMsg({ ok: false, text: "Pick a company." }); return; }

    setBusy(true); setMsg(null);
    const source_id = title.trim() ? `train:${scope}:${title.trim().toLowerCase().replace(/\s+/g, "-").slice(0, 60)}` : undefined;
    const { data, error } = await supabase.functions.invoke("knowledge-ingest", {
      body: {
        text: body,
        title: title.trim() || fileName || null,
        source_kind: kind,
        scope,
        ...(scope === "company" && isSuper ? { company_id: companyId } : {}),
        ...(source_id ? { source_id } : {}),
      },
    });
    setBusy(false);

    if (error || (data && (data as { ok?: boolean }).ok === false)) {
      setMsg({ ok: false, text: error?.message ?? (data as { error?: string })?.error ?? "Training failed." });
      return;
    }
    const stored = (data as { stored?: number })?.stored ?? 0;
    const where = scope === "global" ? "the shared global brain (all companies)" : `${companies.find((c) => c.id === companyId)?.name ?? "the company"}'s brain`;
    setMsg({ ok: true, text: `Learned ${stored} fact${stored === 1 ? "" : "s"} into ${where}.` });
    setText(""); setTitle(""); setFileName(null);
  }

  const label: CSSProperties = { fontSize: 12, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em" };
  const field: CSSProperties = { padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "rgba(255,255,255,0.02)", color: "var(--text)", outline: "none", width: "100%" };

  return (
    <div className="card" style={{ marginBottom: 20, background: "rgba(16,185,129,0.04)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 16, padding: 20 }}>
      <strong style={{ fontSize: 16, color: "#fff" }}>🎓 Train the AI</strong>
      <p className="subtitle" style={{ marginTop: 2 }}>
        Upload a PDF or paste text. Teach one general brain shared by every company, or one company&apos;s own price sheet &amp; offers.
      </p>

      {isSuper && (
        <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
          <button
            onClick={() => setScope("global")}
            style={{ flex: 1, minWidth: 200, padding: "12px 14px", borderRadius: 12, cursor: "pointer", textAlign: "left", border: scope === "global" ? "1px solid #10b981" : "1px solid var(--border)", background: scope === "global" ? "rgba(16,185,129,0.12)" : "rgba(255,255,255,0.02)", color: "var(--text)" }}
          >
            <div style={{ fontWeight: 700, color: "#fff" }}>🌐 Global brain</div>
            <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2 }}>General real-estate knowledge — shared to every company.</div>
          </button>
          <button
            onClick={() => setScope("company")}
            style={{ flex: 1, minWidth: 200, padding: "12px 14px", borderRadius: 12, cursor: "pointer", textAlign: "left", border: scope === "company" ? "1px solid #6366f1" : "1px solid var(--border)", background: scope === "company" ? "rgba(99,102,241,0.12)" : "rgba(255,255,255,0.02)", color: "var(--text)" }}
          >
            <div style={{ fontWeight: 700, color: "#fff" }}>🏢 One company</div>
            <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2 }}>Private price sheet / offer — only that company sees it.</div>
          </button>
        </div>
      )}

      <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
        {scope === "company" && isSuper && (
          <div style={{ display: "grid", gap: 6 }}>
            <span style={label}>Company</span>
            <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} style={field}>
              {companies.length === 0 && <option value="">No companies</option>}
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name || "Untitled company"}</option>)}
            </select>
          </div>
        )}

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "grid", gap: 6, flex: 2, minWidth: 200 }}>
            <span style={label}>Title</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Sector 150 price list — Jul 2026" style={field} />
          </div>
          <div style={{ display: "grid", gap: 6, flex: 1, minWidth: 150 }}>
            <span style={label}>Type</span>
            <select value={kind} onChange={(e) => setKind(e.target.value)} style={field}>
              {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "9px 14px", borderRadius: 10, border: "1px dashed var(--border)", cursor: "pointer", color: "var(--text)", background: "rgba(255,255,255,0.02)" }}>
            <input type="file" accept=".pdf,.txt" onChange={onFile} style={{ display: "none" }} />
            📄 Upload PDF / text
          </label>
          {reading && <span className="subtitle">Reading PDF…</span>}
          {fileName && !reading && <span className="subtitle">✓ {fileName}</span>}
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          <span style={label}>Text {text ? `(${text.length.toLocaleString()} chars)` : ""}</span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste the book / article / price sheet / offer here — or upload a PDF above and it fills in."
            rows={7}
            style={{ ...field, resize: "vertical", lineHeight: 1.5, fontFamily: "inherit" }}
          />
        </div>

        {msg && (
          <div style={{ padding: "9px 12px", borderRadius: 10, fontSize: 13, ...(msg.ok
            ? { color: "#10b981", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.25)" }
            : { color: "#ff453a", background: "rgba(255,69,58,0.1)", border: "1px solid rgba(255,69,58,0.2)" }) }}>
            {msg.text}
          </div>
        )}

        <div>
          <button className="primary" style={{ width: "auto", padding: "11px 24px" }} disabled={busy || reading || text.trim().length < 20} onClick={train}>
            {busy ? "Teaching…" : scope === "global" ? "Teach all companies" : "Teach this company"}
          </button>
        </div>
      </div>
    </div>
  );
}
