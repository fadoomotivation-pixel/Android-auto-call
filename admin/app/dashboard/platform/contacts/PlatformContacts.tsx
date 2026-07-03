"use client";

import { useMemo, useRef, useState, type CSSProperties, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { ContactDetail } from "@/lib/types";

export interface LiteCompany {
  id: string;
  name: string;
}
export interface LiteSalesperson {
  id: string;
  full_name: string | null;
  company_id: string | null;
}

const selectStyle: CSSProperties = {
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--panel)",
  color: "inherit",
  minWidth: 180,
};

const barStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  alignItems: "flex-end",
  background: "var(--panel)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: 16,
  marginBottom: 20,
};

interface ParsedLead {
  phone: string;
  name?: string;
  email?: string;
  company_name?: string;
  notes?: string;
}

// Parse pasted / CSV text. One lead per line: phone, name, email, company, notes.
function parseLeads(text: string): ParsedLead[] {
  const out: ParsedLead[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const cols = line.split(",").map((c) => c.trim());
    const phone = cols[0] ?? "";
    if (!phone) continue;
    out.push({
      phone,
      name: cols[1] || undefined,
      email: cols[2] || undefined,
      company_name: cols[3] || undefined,
      notes: cols[4] || undefined,
    });
  }
  return out;
}

export function PlatformContacts({
  rows,
  companies,
  salespeople,
}: {
  rows: ContactDetail[];
  companies: LiteCompany[];
  salespeople: LiteSalesperson[];
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Reassign target
  const [assignCompany, setAssignCompany] = useState("");
  const [assignPerson, setAssignPerson] = useState("");

  // Add-lead target + inputs
  const [addCompany, setAddCompany] = useState("");
  const [addPerson, setAddPerson] = useState("");
  const [single, setSingle] = useState<ParsedLead>({ phone: "" });
  const [bulkText, setBulkText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const companyName = (id: string | null) => companies.find((c) => c.id === id)?.name ?? "—";
  const peopleFor = (companyId: string) =>
    salespeople.filter((p) => p.company_id === companyId);

  const allSelected = rows.length > 0 && selected.size === rows.length;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  }

  function flash(message: string) {
    setMsg(message);
    setErr(null);
    router.refresh();
  }

  async function reassign() {
    if (!assignCompany || selected.size === 0) return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    const { data, error } = await supabase.rpc("admin_assign_contacts", {
      p_contact_ids: Array.from(selected),
      p_company_id: assignCompany,
      p_salesperson_id: assignPerson || null,
    });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setSelected(new Set());
    setAssignPerson("");
    flash(`Reassigned ${data ?? 0} lead(s) to ${companyName(assignCompany)}.`);
  }

  async function deleteSelected() {
    if (selected.size === 0) return;
    if (!confirm(`Are you sure you want to permanently delete ${selected.size} lead(s)?`)) return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    const { error } = await supabase.rpc("admin_delete_contacts", {
      p_contact_ids: Array.from(selected)
    });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setSelected(new Set());
    flash(`Deleted ${selected.size} lead(s).`);
  }

  async function createLeads(leads: ParsedLead[]) {
    if (!addCompany) {
      setErr("Pick a company to add the leads to.");
      return;
    }
    if (leads.length === 0) {
      setErr("No leads with a phone number to add.");
      return;
    }
    setBusy(true);
    setErr(null);
    setMsg(null);
    const { data, error } = await supabase.rpc("admin_create_leads", {
      p_company_id: addCompany,
      p_leads: leads,
      p_salesperson_id: addPerson || null,
    });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setSingle({ phone: "" });
    setBulkText("");
    if (fileRef.current) fileRef.current.value = "";
    flash(`Added ${data ?? 0} lead(s) to ${companyName(addCompany)}.`);
  }

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      // Drop a header row if it clearly isn't a phone number.
      const lines = text.split(/\r?\n/);
      if (lines[0] && /phone|name|email/i.test(lines[0]) && !/\d{4,}/.test(lines[0])) {
        lines.shift();
      }
      setBulkText(lines.join("\n"));
    };
    reader.readAsText(file);
  }

  const bulkParsed = parseLeads(bulkText);

  return (
    <>
      {err && <div className="error" style={{ marginBottom: 12 }}>{err}</div>}
      {msg && (
        <div style={{ color: "var(--good)", fontSize: 13, marginBottom: 12 }}>{msg}</div>
      )}

      {/* ---- Reassign selected ---- */}
      <div style={barStyle}>
        <div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>
            Reassign {selected.size} selected lead(s)
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
            <select
              style={selectStyle}
              value={assignCompany}
              onChange={(e) => {
                setAssignCompany(e.target.value);
                setAssignPerson("");
              }}
            >
              <option value="">To company…</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              style={selectStyle}
              value={assignPerson}
              onChange={(e) => setAssignPerson(e.target.value)}
              disabled={!assignCompany}
            >
              <option value="">Unassigned (company pool)</option>
              {peopleFor(assignCompany).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name ?? "—"}
                </option>
              ))}
            </select>
            <button
              className="primary"
              onClick={reassign}
              disabled={busy || !assignCompany || selected.size === 0}
            >
              {busy ? "Working…" : `Assign ${selected.size}`}
            </button>
            <button
              className="primary"
              style={{ background: "#ef4444", borderColor: "#ef4444" }}
              onClick={deleteSelected}
              disabled={busy || selected.size === 0}
            >
              🗑️ Delete {selected.size}
            </button>
          </div>
        </div>
      </div>

      {/* ---- Add new leads ---- */}
      <details style={{ ...barStyle, display: "block" }}>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>Add new leads</summary>
        <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <select
            style={selectStyle}
            value={addCompany}
            onChange={(e) => {
              setAddCompany(e.target.value);
              setAddPerson("");
            }}
          >
            <option value="">Add to company…</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            style={selectStyle}
            value={addPerson}
            onChange={(e) => setAddPerson(e.target.value)}
            disabled={!addCompany}
          >
            <option value="">Unassigned (company pool)</option>
            {peopleFor(addCompany).map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name ?? "—"}
              </option>
            ))}
          </select>
        </div>

        {/* single */}
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>Single lead</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <input
              style={selectStyle}
              placeholder="Phone *"
              value={single.phone}
              onChange={(e) => setSingle({ ...single, phone: e.target.value })}
            />
            <input
              style={selectStyle}
              placeholder="Name"
              value={single.name ?? ""}
              onChange={(e) => setSingle({ ...single, name: e.target.value })}
            />
            <input
              style={selectStyle}
              placeholder="Email"
              value={single.email ?? ""}
              onChange={(e) => setSingle({ ...single, email: e.target.value })}
            />
            <input
              style={selectStyle}
              placeholder="Company"
              value={single.company_name ?? ""}
              onChange={(e) => setSingle({ ...single, company_name: e.target.value })}
            />
            <button
              className="primary"
              onClick={() => createLeads(single.phone.trim() ? [single] : [])}
              disabled={busy || !addCompany || !single.phone.trim()}
            >
              Add lead
            </button>
          </div>
        </div>

        {/* bulk */}
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>
            Bulk paste / CSV — one per line: <code>phone, name, email, company, notes</code>
          </div>
          <textarea
            style={{ ...selectStyle, width: "100%", minHeight: 110, fontFamily: "monospace" }}
            placeholder={"9876543210, Jane Doe, jane@acme.com, Acme Realty, hot lead"}
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
          />
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 8 }}>
            <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" onChange={onFile} />
            <button
              className="primary"
              onClick={() => createLeads(bulkParsed)}
              disabled={busy || !addCompany || bulkParsed.length === 0}
            >
              {busy ? "Working…" : `Add ${bulkParsed.length} lead(s)`}
            </button>
          </div>
        </div>
      </details>

      {/* ---- Table ---- */}
      {rows.length === 0 ? (
        <div className="empty">No contacts yet.</div>
      ) : (
        <div className="table-responsive">
<table>
          <thead>
            <tr>
              <th style={{ width: 36 }}>
                <input type="checkbox" checked={allSelected} onChange={toggleAll} />
              </th>
              <th>Name</th>
              <th>Phone</th>
              <th>Company</th>
              <th>Telecaller</th>
              <th>Campaign</th>
              <th>Status</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="hover-row">
                <td>
                  <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                </td>
                <td>{c.name || "—"}</td>
                <td>{c.phone}</td>
                <td>{c.company_name || "—"}</td>
                <td>{c.salesperson_name || "—"}</td>
                <td>
                  {c.campaign_name || "—"}
                  {c.campaign_deleted && (
                    <span className="badge dnc" style={{ marginLeft: 6 }}>
                      deleted
                    </span>
                  )}
                </td>
                <td>
                  <span className={`badge ${c.status}`}>{c.status}</span>
                </td>
                <td style={{ maxWidth: 280, whiteSpace: "pre-wrap" }}>{c.notes || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
</div>
      )}
    </>
  );
}

