"use client";

import { useRef, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { parseRows, parsePasted, parseCSV, decodeText, type ParsedLead } from "@/lib/leadImport";

type Sp = { id: string; full_name: string | null; company_id?: string | null };

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

export function ImportLeads({
  companyId,
  companies,
  salespeople,
  onClose,
  onDone,
}: {
  /** Pre-picked target company. May be "" for a super admin — they pick inside. */
  companyId: string;
  /** Super admin only: [id, name] choices for the in-modal target picker. */
  companies?: [string, string][];
  salespeople: Sp[];
  onClose: () => void;
  onDone: (count: number) => void;
}) {
  const supabase = createClient();
  const fileRef = useRef<HTMLInputElement>(null);
  // The company picker sits at the top of the modal; with a few hundred rows
  // previewed, the footer is a long scroll below it. Held so a blocked import
  // can scroll the rep back to the field that is actually blocking them.
  const companyRef = useRef<HTMLSelectElement>(null);
  // The company these leads land in (and dedupe against). A regular admin is
  // always their own company; a super admin picks it here — REQUIRED before
  // importing, because the platform-HQ tenant would silently bypass the real
  // tenant's per-company dedup.
  const [targetCompany, setTargetCompany] = useState(companyId);
  // Only that company's reps may receive its leads — never another tenant's.
  const scopedReps = salespeople.filter((sp) => sp.company_id == null || sp.company_id === targetCompany);
  // Super admin with no company chosen yet: the one thing standing between
  // them and the import, and the reason the footer used to look broken.
  // Only when there is in fact a picker to send them to.
  const needsCompany = !targetCompany && !!companies?.length;
  const targetCompanyName = companies?.find(([id]) => id === targetCompany)?.[1] ?? "";
  const [mode, setMode] = useState<"file" | "paste">("file");
  const [paste, setPaste] = useState("");
  const [parsed, setParsed] = useState<ParsedLead[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [mappedFields, setMappedFields] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [assignTo, setAssignTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [duplicateConflicts, setDuplicateConflicts] = useState<ParsedLead[]>([]);
  const [freshLeads, setFreshLeads] = useState<ParsedLead[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  async function onFile(file: File) {
    setError(null);
    setFileName(file.name);
    try {
      let rows: string[][];

      const lower = file.name.toLowerCase();
      if (lower.endsWith(".csv") || lower.endsWith(".tsv") || lower.endsWith(".txt")) {
        // Decode honouring the BOM (Facebook lead exports are UTF-16 + tab).
        const buf = await file.arrayBuffer();
        rows = parseCSV(decodeText(buf));
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
      setMappedFields(res.mappedFields ?? []);
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
    setMappedFields(res.mappedFields ?? []);
  }

  async function doImport() {
    if (parsed.length === 0) return;
    if (!targetCompany) {
      // This guard used to be unreachable: the button was disabled whenever it
      // would have fired, so the sentence explaining the block never rendered.
      // The picker now sits in the same sticky footer as the button, so all
      // this has to do is say which field and put the cursor in it.
      setError("Choose a company first — “Leave unassigned” only means no rep is given these leads.");
      companyRef.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);

    // Check for duplicates. PostgREST caps a select at 1000 rows, so page
    // through ALL existing phones — otherwise big lists silently miss dupes
    // beyond the first 1000 and re-import them.
    const norm = (p: string) => (p || "").replace(/\D/g, "").slice(-10);
    const have = new Set<string>();
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data: page, error: pErr } = await supabase
        .from("contacts")
        .select("phone")
        .eq("company_id", targetCompany)
        .range(from, from + PAGE - 1);
      if (pErr) break;
      for (const r of page ?? []) have.add(norm(r.phone as string));
      if (!page || page.length < PAGE) break;
    }
    const fresh: typeof parsed = [];
    const dupes: typeof parsed = [];
    const seenNew = new Set<string>();
    
    for (const l of parsed) {
      const n = norm(l.phone);
      if (!have.has(n) && !seenNew.has(n)) {
        fresh.push(l);
        seenNew.add(n);
      } else {
        dupes.push(l);
      }
    }

    if (dupes.length > 0) {
      setFreshLeads(fresh);
      setDuplicateConflicts(dupes);
      setBusy(false);
      return;
    }

    await executeImport(fresh);
  }

  async function executeImport(leadsToImport: ParsedLead[]) {
    if (leadsToImport.length === 0) {
      setBusy(false);
      setDuplicateConflicts([]);
      setError(`All ${parsed.length} lead(s) already exist for this company (or are duplicates) — nothing to import.`);
      return;
    }

    setBusy(true);
    const rows = leadsToImport.map((l) => ({
      company_id: targetCompany,
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
    setProgress({ done: 0, total: rows.length });
    let inserted = 0;
    for (const part of chunk(rows, 500)) {
      const { error } = await supabase.from("contacts").insert(part);
      if (error) {
        setBusy(false);
        setProgress(null);
        setError(`Import failed after ${inserted}: ${error.message}`);
        return;
      }
      inserted += part.length;
      setProgress({ done: inserted, total: rows.length });
    }
    setBusy(false);
    setProgress(null);
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
  const thCell: React.CSSProperties = { textAlign: "left", padding: "8px 10px", fontSize: 11, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--muted)", fontWeight: 600 };
  const tdCell: React.CSSProperties = { padding: "7px 10px", color: "var(--text)" };

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

        {/* The company picker used to live here, at the top. It is REQUIRED —
            the dedup check and the reps list are both scoped to it — and it
            sat several hundred preview rows above the Import button, so the
            one mandatory field was off-screen at the moment of the click while
            the OPTIONAL "Assign to" sat right beside the button. It now lives
            in the footer next to the action it gates. */}

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
            role="button"
            tabIndex={0}
            onClick={() => fileRef.current?.click()}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileRef.current?.click(); } }}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={(e) => { e.preventDefault(); setDragging(false); }}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const f = e.dataTransfer.files?.[0];
              if (f) void onFile(f);
            }}
            style={{ border: `2px dashed ${dragging ? "var(--accent)" : "rgba(255,255,255,0.15)"}`, borderRadius: 16, padding: "50px 16px", textAlign: "center", cursor: "pointer", background: dragging ? "rgba(99,102,241,0.08)" : "rgba(255,255,255,0.01)", transition: "all 0.2s" }}
          >
            <div style={{ fontSize: 32, opacity: 0.8 }}>📁</div>
            <div style={{ fontWeight: 600, marginTop: 8 }}>{fileName ?? "Click to upload"}</div>
            <div className="subtitle" style={{ marginTop: 4 }}>Drag &amp; drop or click · .csv, .xlsx, .xls</div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.tsv,.txt,.xlsx,.xls"
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

        {parsed.length === 0 && (
          <p className="subtitle" style={{ marginTop: 10 }}>
            Detected columns: <strong>phone</strong> (required), and optionally name, email, project, budget, notes. Duplicates in the file are skipped.
          </p>
        )}

        {parsed.length > 0 && (
          <div style={{ marginTop: 14 }}>
            {/* Stat strip — ready vs skipped, at a glance. */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
              <span style={{ padding: "4px 12px", borderRadius: 999, background: "rgba(16,185,129,0.12)", color: "#10b981", fontWeight: 700, fontSize: 14 }}>
                ✓ {parsed.length} ready
              </span>
              {skipped > 0 && (
                <span style={{ padding: "4px 12px", borderRadius: 999, background: "rgba(148,163,184,0.12)", color: "var(--muted)", fontSize: 13 }}>
                  {skipped} skipped (no phone / duplicate)
                </span>
              )}
            </div>

            {/* Which fields we understood — trust signal. */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
              <span style={{ fontSize: 12, color: "var(--muted)", alignSelf: "center" }}>We read:</span>
              {mappedFields.map((f) => (
                <span key={f} style={{ padding: "3px 10px", borderRadius: 999, fontSize: 12, background: "rgba(99,102,241,0.12)", color: "#a5b4fc", textTransform: "capitalize", fontWeight: 600 }}>
                  {f}
                </span>
              ))}
            </div>

            {/* Live preview table — the admin SEES exactly what's coming in. */}
            <div style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ maxHeight: 220, overflow: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ position: "sticky", top: 0, background: "rgba(20,20,24,0.98)", backdropFilter: "blur(8px)" }}>
                      <th style={thCell}>#</th>
                      <th style={thCell}>Name</th>
                      <th style={thCell}>Phone</th>
                      {mappedFields.includes("budget") && <th style={thCell}>Budget</th>}
                      {mappedFields.includes("project") && <th style={thCell}>Project</th>}
                      {mappedFields.includes("notes") && <th style={thCell}>Notes</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.slice(0, 50).map((l, i) => (
                      <tr key={i} style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                        <td style={{ ...tdCell, color: "var(--muted)" }}>{i + 1}</td>
                        <td style={tdCell}>{l.name || <span style={{ color: "var(--muted)" }}>—</span>}</td>
                        <td style={{ ...tdCell, fontFamily: "monospace" }}>{l.phone}</td>
                        {mappedFields.includes("budget") && <td style={tdCell}>{l.budget || "—"}</td>}
                        {mappedFields.includes("project") && <td style={tdCell}>{l.project || "—"}</td>}
                        {mappedFields.includes("notes") && <td style={{ ...tdCell, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.notes || "—"}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {parsed.length > 50 && (
                <div style={{ padding: "8px 12px", fontSize: 12, color: "var(--muted)", background: "rgba(255,255,255,0.02)", borderTop: "1px solid var(--border)" }}>
                  Showing first 50 of {parsed.length} — all {parsed.length} will import.
                </div>
              )}
            </div>
          </div>
        )}

        {/* EVERYTHING that answers "what happens when I press the button" is
            pinned to the bottom of the scrolling card: the error, the
            duplicate decision, the two dropdowns, the button. With 661 rows
            previewed, anything not pinned here is off-screen at the moment it
            matters — which is how a required field and, worse, the duplicate
            prompt that REPLACES this footer could both go unseen. */}
        <div
          style={{
            position: "sticky",
            bottom: 0,
            marginTop: 16,
            paddingTop: 12,
            background: "rgba(10, 10, 12, 0.94)",
            backdropFilter: "blur(24px)",
            borderTop: "1px solid rgba(255,255,255,0.08)",
          }}
        >
        {error && <div className="error" style={{ marginBottom: 10 }}>{error}</div>}

        {duplicateConflicts.length > 0 ? (
          <div className="card" style={{ marginBottom: 12, background: "rgba(245, 158, 11, 0.05)", border: "1px solid rgba(245, 158, 11, 0.2)" }}>
            <strong style={{ color: "#f59e0b" }}>⚠️ Found {duplicateConflicts.length} duplicate leads</strong>
            <p className="subtitle" style={{ marginTop: 4 }}>
              These numbers already exist in your system or appear multiple times in your file.
            </p>
            <div style={{ marginTop: 8, fontSize: 13, color: "var(--muted)", maxHeight: 80, overflow: "auto" }}>
              {duplicateConflicts.slice(0, 10).map((l, i) => <div key={i}>{l.name || l.phone} ({l.phone})</div>)}
              {duplicateConflicts.length > 10 ? <div>...and {duplicateConflicts.length - 10} more</div> : null}
            </div>
            
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button className="primary" style={{ flex: 1 }} onClick={() => {
                setDuplicateConflicts([]);
                executeImport(parsed); // Force import all
              }}>
                Import Anyway ({parsed.length})
              </button>
              <button className="link" style={{ flex: 1, border: "1px solid var(--border)" }} onClick={() => {
                setDuplicateConflicts([]);
                executeImport(freshLeads); // Skip dupes
              }}>
                Skip Duplicates ({freshLeads.length})
              </button>
            </div>
          </div>
        ) : (
          <div>
            {/* TWO dropdowns, and they are not the same question. Company =
                which business owns these leads (required, decides the dedup
                set). Rep = who calls them (optional). "Leave unassigned"
                answers the second one, and was read as answering both. */}
            {companies && companies.length > 0 && (
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: targetCompany ? "var(--muted)" : "#f59e0b", minWidth: 132 }}>
                  Which company? *
                </span>
                <select
                  ref={companyRef}
                  value={targetCompany}
                  disabled={busy}
                  onChange={(e) => {
                    setTargetCompany(e.target.value);
                    setAssignTo(""); // reps belong to the previous company
                    setDuplicateConflicts([]); // stale — dedup was vs the previous company
                    setFreshLeads([]);
                    setError(null);
                  }}
                  style={{ ...input, flex: 1, minWidth: 200, borderColor: targetCompany ? "var(--border)" : "#f59e0b" }}
                >
                  <option value="">— required: pick a company —</option>
                  {companies.map(([id, name]) => (
                    <option key={id} value={id}>{name}</option>
                  ))}
                </select>
              </div>
            )}
            {needsCompany && (
              <div style={{ fontSize: 12.5, color: "#f59e0b", marginBottom: 10 }}>
                These {parsed.length} leads need a company before they can import.
                “Leave unassigned” below only means no rep is given the leads — it does not answer this.
              </div>
            )}
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", paddingBottom: 12 }}>
              <span style={{ fontSize: 13, color: "var(--muted)", minWidth: 132 }}>Which rep? (optional)</span>
              {/* A DISABLED CONTROL HAS TO SAY WHY IT IS DISABLED.
                  This greys out until a company is chosen, because only that
                  company's reps may receive its leads. When there is no company
                  to choose either — the telecaller list failed to load — the
                  dropdown simply would not open and nothing on screen explained
                  it, which read as a broken page rather than missing data. */}
              <select value={assignTo} onChange={(e) => setAssignTo(e.target.value)} style={input}
                disabled={!targetCompany || scopedReps.length === 0}>
                <option value="">
                  {!targetCompany
                    ? "Pick a company first"
                    : scopedReps.length === 0
                      ? "No telecallers in this company"
                      : "Leave unassigned"}
                </option>
                {scopedReps.map((sp) => (
                  <option key={sp.id} value={sp.id}>{sp.full_name || sp.id.slice(0, 8)}</option>
                ))}
              </select>
              <div style={{ flex: 1 }} />
              <button className="link" onClick={onClose}>Cancel</button>
              <button
                className="primary"
                style={{ width: "auto", padding: "9px 18px" }}
                // NOT disabled on a missing company: doImport says why and
                // focuses the field. Only a real dead end greys it out.
                disabled={busy || parsed.length === 0}
                title={targetCompany ? "" : "Pick which company these leads import into."}
                onClick={doImport}
              >
                {busy ? "Importing…" : `Import ${parsed.length || ""}${targetCompanyName ? ` → ${targetCompanyName}` : ""}`}
              </button>
            </div>
          </div>
        )}

        {/* Inside the pinned region too — a progress bar you have to scroll to
            find is indistinguishable from a button that did nothing. */}
        {progress && (
          <div style={{ paddingBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--muted)", marginBottom: 6 }}>
              <span>Importing…</span>
              <span>{progress.done} / {progress.total}</span>
            </div>
            <div style={{ height: 8, borderRadius: 999, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
              <div style={{
                height: "100%",
                width: `${progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0}%`,
                background: "linear-gradient(90deg, #6366f1, #10b981)",
                transition: "width 0.3s ease",
              }} />
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
