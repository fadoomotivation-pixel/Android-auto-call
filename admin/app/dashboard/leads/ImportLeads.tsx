"use client";

import { useRef, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { parseRows, parsePasted, parseCSV, type ParsedLead } from "@/lib/leadImport";

type Sp = { id: string; full_name: string | null };

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

export function ImportLeads({
  companyId,
  salespeople,
  onClose,
  onDone,
}: {
  companyId: string;
  salespeople: Sp[];
  onClose: () => void;
  onDone: (count: number) => void;
}) {
  const supabase = createClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"file" | "paste">("file");
  const [paste, setPaste] = useState("");
  const [parsed, setParsed] = useState<ParsedLead[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [fileName, setFileName] = useState<string | null>(null);
  const [assignTo, setAssignTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(file: File) {
    setError(null);
    setFileName(file.name);
    try {
      let rows: string[][];

      if (file.name.toLowerCase().endsWith(".csv")) {
        const text = await file.text();
        rows = parseCSV(text);
      } else {
        const xlsxModule = await import("xlsx");
        const readFn = xlsxModule.read || (xlsxModule as any).default?.read;
        const utilsObj = xlsxModule.utils || (xlsxModule as any).default?.utils;
        if (!readFn || !utilsObj) throw new Error("Excel library failed to load properly.");

        const buf = await file.arrayBuffer();
        const wb = readFn(buf, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        rows = utilsObj.sheet_to_json<string[]>(sheet, { header: 1, blankrows: false, defval: "" });
      }
      
      const res = parseRows(rows);
      setParsed(res.leads);
      setSkipped(res.skipped);
      if (res.leads.length === 0) setError("No valid phone numbers found in that file.");
    } catch (e) {
      setError(`Couldn't read file: ${String(e)}`);
    }
  }

  function onPaste(text: string) {
    setPaste(text);
    const res = parsePasted(text);
    setParsed(res.leads);
    setSkipped(res.skipped);
  }

  async function doImport() {
    if (parsed.length === 0) return;
    setBusy(true);
    setError(null);
    const rows = parsed.map((l) => ({
      company_id: companyId,
      salesperson_id: assignTo || null,
      name: l.name,
      phone: l.phone,
      email: l.email,
      company_name: l.project,
      budget: l.budget,
      territory: l.territory,
      notes: l.notes,
      status: "new",
    }));
    let inserted = 0;
    for (const part of chunk(rows, 500)) {
      const { error } = await supabase.from("contacts").insert(part);
      if (error) {
        setBusy(false);
        setError(`Import failed after ${inserted}: ${error.message}`);
        return;
      }
      inserted += part.length;
    }
    setBusy(false);
    onDone(inserted);
  }

  const input: React.CSSProperties = {
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "rgba(255,255,255,0.02)",
    color: "var(--text)",
    outline: "none",
    backdropFilter: "blur(12px)",
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 50 }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ width: "min(640px, 100%)", maxHeight: "90vh", overflow: "auto", background: "rgba(10, 10, 12, 0.85)", border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(24px)", boxShadow: "0 24px 64px rgba(0,0,0,0.6)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0 }}>Import Leads</h3>
          <button className="link" onClick={onClose}>✕</button>
        </div>

        <div style={{ display: "flex", gap: 8, margin: "14px 0" }}>
          <button
            onClick={() => setMode("file")}
            style={{ flex: 1, padding: "10px", borderRadius: 8, border: "1px solid var(--border)", cursor: "pointer", background: mode === "file" ? "var(--accent)" : "rgba(255,255,255,0.02)", color: mode === "file" ? "#fff" : "var(--text)", fontWeight: mode === "file" ? 600 : 400, transition: "all 0.2s" }}
          >
            Upload File (CSV/Excel)
          </button>
          <button
            onClick={() => setMode("paste")}
            style={{ flex: 1, padding: "10px", borderRadius: 8, border: "1px solid var(--border)", cursor: "pointer", background: mode === "paste" ? "var(--accent)" : "rgba(255,255,255,0.02)", color: mode === "paste" ? "#fff" : "var(--text)", fontWeight: mode === "paste" ? 600 : 400, transition: "all 0.2s" }}
          >
            Copy &amp; Paste
          </button>
        </div>

        {mode === "file" ? (
          <div
            style={{ border: "2px dashed rgba(255,255,255,0.15)", borderRadius: 16, padding: "50px 16px", textAlign: "center", cursor: "pointer", background: "rgba(255,255,255,0.01)", transition: "all 0.2s hover:border-accent" }}
          >
            <div style={{ fontSize: 32, opacity: 0.8 }}>📁</div>
            <div style={{ fontWeight: 600, marginTop: 8 }}>{fileName ?? "Click to upload"}</div>
            <div className="subtitle" style={{ marginTop: 4 }}>Supports .csv, .xlsx, .xls</div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); }}
            />
          </div>
        ) : (
          <textarea
            value={paste}
            onChange={(e) => onPaste(e.target.value)}
            placeholder={"Paste rows from Excel/Sheets here.\nFirst row can be a header (name, phone, project…).\nOr just paste one phone number per line."}
            style={{ ...input, width: "100%", minHeight: 180, fontFamily: "monospace" }}
          />
        )}

        <p className="subtitle" style={{ marginTop: 10 }}>
          Detected columns: <strong>phone</strong> (required), and optionally name, email, project, budget, notes. Duplicates in the file are skipped.
        </p>

        {parsed.length > 0 && (
          <div className="card" style={{ marginTop: 12, background: "rgba(16, 185, 129, 0.05)", border: "1px solid rgba(16, 185, 129, 0.2)" }}>
            <strong>{parsed.length}</strong> lead(s) ready{skipped > 0 ? `, ${skipped} skipped` : ""}.
            <div style={{ marginTop: 6, fontSize: 13, color: "var(--muted)" }}>
              Preview: {parsed.slice(0, 3).map((l) => l.name || l.phone).join(", ")}
              {parsed.length > 3 ? "…" : ""}
            </div>
          </div>
        )}

        {error && <div className="error" style={{ marginTop: 8 }}>{error}</div>}

        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 16, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, color: "var(--muted)" }}>Assign to (optional):</span>
          <select value={assignTo} onChange={(e) => setAssignTo(e.target.value)} style={input}>
            <option value="">Leave unassigned</option>
            {salespeople.map((sp) => (
              <option key={sp.id} value={sp.id}>{sp.full_name || sp.id.slice(0, 8)}</option>
            ))}
          </select>
          <div style={{ flex: 1 }} />
          <button className="link" onClick={onClose}>Cancel</button>
          <button className="primary" style={{ width: "auto", padding: "9px 18px" }} disabled={busy || parsed.length === 0} onClick={doImport}>
            {busy ? "Importing…" : `Import ${parsed.length || ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
