"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Company = { id: string; name: string | null };
type Rep = { id: string; full_name: string | null };
type Form = {
  form_id: string;
  name: string;
  leads_count: number;
  status: string;
  page_id: string;
  route_company_id: string | null;
  route_rep_id: string | null;
};

/**
 * Super-admin only. One central Facebook page runs ads for many companies, so
 * each lead FORM has to be pointed at the company it actually belongs to
 * (e.g. "Jewar Airport" → Manas). New leads then flow to the right team; the
 * webhook reads this mapping (facebook_lead_routes). Only affects NEW leads.
 */
export function FormRouting() {
  const supabase = createClient();
  const [forms, setForms] = useState<Form[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [repsByCompany, setRepsByCompany] = useState<Record<string, Rep[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.functions.invoke<{ ok: boolean; error?: string; forms?: Form[]; companies?: Company[] }>(
      "facebook-manage",
      { body: { action: "list_forms" } },
    );
    setLoading(false);
    if (error || !data?.ok) {
      setError(data?.error || error?.message || "Couldn't load lead forms.");
      return;
    }
    // Busiest forms first — that's where routing matters most.
    setForms((data.forms ?? []).sort((a, b) => (b.leads_count ?? 0) - (a.leads_count ?? 0)));
    setCompanies(data.companies ?? []);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  async function loadReps(companyId: string) {
    if (!companyId || repsByCompany[companyId]) return;
    const { data } = await supabase.from("profiles")
      .select("id, full_name").eq("company_id", companyId).eq("role", "salesperson").order("full_name")
      .returns<Rep[]>();
    setRepsByCompany((m) => ({ ...m, [companyId]: data ?? [] }));
  }

  async function setRoute(form: Form, companyId: string | null, repId: string | null) {
    setSavingId(form.form_id);
    setSavedId(null);
    let err: string | null = null;
    if (!companyId) {
      const { error } = await supabase.from("facebook_lead_routes").delete().eq("form_id", form.form_id);
      err = error?.message ?? null;
    } else {
      const { error } = await supabase.from("facebook_lead_routes").upsert({
        form_id: form.form_id,
        company_id: companyId,
        salesperson_id: repId,
        form_name: form.name || null,
        updated_at: new Date().toISOString(),
      });
      err = error?.message ?? null;
    }
    setSavingId(null);
    if (err) { setError(err); return; }
    setForms((fs) => fs.map((f) => f.form_id === form.form_id
      ? { ...f, route_company_id: companyId, route_rep_id: companyId ? repId : null } : f));
    setSavedId(form.form_id);
    setTimeout(() => setSavedId((id) => (id === form.form_id ? null : id)), 1500);
  }

  const cell = { padding: "8px 10px", verticalAlign: "top" } as const;
  const select = { padding: "7px 9px", borderRadius: 8, border: "1px solid var(--border)", background: "rgba(255,255,255,0.03)", color: "var(--text)", minWidth: 150 } as const;

  return (
    <div className="card" style={{ background: "rgba(255,255,255,0.015)", border: "1px solid var(--border)", padding: 28, borderRadius: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h3 style={{ marginTop: 0, marginBottom: 4, color: "var(--accent)", fontSize: 15, letterSpacing: "1px", textTransform: "uppercase" }}>Lead form → company routing</h3>
          <p style={{ fontSize: 13.5, color: "var(--muted)", margin: 0, lineHeight: 1.6, maxWidth: 640 }}>
            One central Facebook runs ads for every company. Point each lead form at the company it belongs to
            (e.g. <b style={{ color: "var(--text)" }}>Jewar Airport → Manas</b>). New leads go straight to that team.
            Unmapped forms fall back to the page&apos;s own company. Only affects future leads.
          </p>
        </div>
        <button type="button" onClick={load} disabled={loading}
          style={{ fontSize: 12, padding: "7px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "rgba(255,255,255,0.04)", color: "var(--muted)", cursor: "pointer" }}>
          {loading ? "Loading…" : "🔄 Refresh"}
        </button>
      </div>

      {error && <div style={{ marginTop: 12, fontSize: 13, color: "#f87171" }}>{error}</div>}

      {!loading && forms.length === 0 && !error && (
        <p style={{ fontSize: 14, color: "var(--muted)", marginTop: 16 }}>No lead forms found. Connect a Page (Step 1) that has lead forms.</p>
      )}

      {forms.length > 0 && (
        <div style={{ overflowX: "auto", marginTop: 16 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--muted)", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                <th style={cell}>Lead form</th>
                <th style={cell}>Leads</th>
                <th style={cell}>Goes to company</th>
                <th style={cell}>Specific rep (optional)</th>
                <th style={cell}></th>
              </tr>
            </thead>
            <tbody>
              {forms.map((f) => {
                const reps = f.route_company_id ? (repsByCompany[f.route_company_id] ?? []) : [];
                return (
                  <tr key={f.form_id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ ...cell, color: "var(--text)", fontWeight: 500, maxWidth: 320 }}>
                      {f.name || f.form_id}
                      {f.status && f.status !== "ACTIVE" && <span style={{ color: "var(--muted)", fontWeight: 400 }}> · {f.status.toLowerCase()}</span>}
                    </td>
                    <td style={{ ...cell, color: "var(--muted)" }}>{f.leads_count}</td>
                    <td style={cell}>
                      <select
                        style={select}
                        value={f.route_company_id ?? ""}
                        onFocus={() => f.route_company_id && loadReps(f.route_company_id)}
                        onChange={(e) => { const c = e.target.value || null; if (c) loadReps(c); setRoute(f, c, null); }}
                      >
                        <option value="">— fallback (page&apos;s company) —</option>
                        {companies.map((c) => <option key={c.id} value={c.id}>{c.name ?? c.id}</option>)}
                      </select>
                    </td>
                    <td style={cell}>
                      <select
                        style={{ ...select, opacity: f.route_company_id ? 1 : 0.5 }}
                        disabled={!f.route_company_id}
                        value={f.route_rep_id ?? ""}
                        onFocus={() => f.route_company_id && loadReps(f.route_company_id)}
                        onChange={(e) => setRoute(f, f.route_company_id, e.target.value || null)}
                      >
                        <option value="">Auto-assign (least busy)</option>
                        {reps.map((r) => <option key={r.id} value={r.id}>{r.full_name ?? r.id}</option>)}
                      </select>
                    </td>
                    <td style={{ ...cell, whiteSpace: "nowrap", color: "var(--muted)", fontSize: 12 }}>
                      {savingId === f.form_id ? "Saving…" : savedId === f.form_id ? <span style={{ color: "#22c55e" }}>Saved ✓</span> : ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
