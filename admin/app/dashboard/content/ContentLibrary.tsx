"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Asset = {
  id: string;
  kind: string;
  title: string;
  url: string;
  description: string | null;
  active: boolean;
  created_at: string;
};

const KINDS = ["brochure", "image", "video", "review", "testimonial", "link", "other"] as const;

const input: React.CSSProperties = {
  padding: "10px 14px", borderRadius: 8, border: "1px solid var(--border)",
  background: "rgba(255,255,255,0.02)", color: "var(--text)", width: "100%", outline: "none",
};
const field: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 6, minWidth: 0 };
const lbl: React.CSSProperties = { fontSize: 13, color: "var(--muted)", fontWeight: 500 };

export function ContentLibrary({ companyId, assets }: { companyId: string; assets: Asset[] }) {
  const router = useRouter();
  const [form, setForm] = useState({ kind: "brochure", title: "", url: "", description: "" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function add() {
    if (!form.title.trim() || !form.url.trim()) { setErr("Title and URL are required."); return; }
    setSaving(true); setErr(null);
    const supabase = createClient();
    const { error } = await supabase.from("content_assets").insert({
      company_id: companyId,
      kind: form.kind,
      title: form.title.trim(),
      url: form.url.trim(),
      description: form.description.trim() || null,
    });
    setSaving(false);
    if (error) { setErr(error.message); return; }
    setForm({ kind: "brochure", title: "", url: "", description: "" });
    router.refresh();
  }

  async function toggleActive(a: Asset) {
    const supabase = createClient();
    const { error } = await supabase.from("content_assets").update({ active: !a.active }).eq("id", a.id);
    if (!error) router.refresh();
  }

  async function remove(a: Asset) {
    if (!confirm(`Delete "${a.title}"?`)) return;
    const supabase = createClient();
    const { error } = await supabase.from("content_assets").delete().eq("id", a.id);
    if (!error) router.refresh();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 760 }}>
      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <h3 style={{ margin: 0 }}>Add content</h3>
        <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 12 }}>
          <div style={field}>
            <label style={lbl}>Type</label>
            <select style={input} value={form.kind} onChange={(e) => set("kind", e.target.value)}>
              {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          <div style={field}>
            <label style={lbl}>Title</label>
            <input style={input} value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Skyline Towers brochure" />
          </div>
        </div>
        <div style={field}>
          <label style={lbl}>URL</label>
          <input style={input} value={form.url} onChange={(e) => set("url", e.target.value)} placeholder="https://…" />
        </div>
        <div style={field}>
          <label style={lbl}>Description (optional)</label>
          <input style={input} value={form.description} onChange={(e) => set("description", e.target.value)} />
        </div>
        {err && <div style={{ color: "var(--danger, #ef4444)", fontSize: 13 }}>{err}</div>}
        <div>
          <button className="primary" onClick={add} disabled={saving}>{saving ? "Adding…" : "Add to library"}</button>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Library ({assets.length})</h3>
        {assets.length === 0
          ? <div className="empty">No content yet. Add brochures, videos or reviews above.</div>
          : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--muted)", fontSize: 12 }}>
                  <th style={{ padding: "6px 4px" }}>Type</th>
                  <th style={{ padding: "6px 4px" }}>Title</th>
                  <th style={{ padding: "6px 4px" }}>Status</th>
                  <th style={{ padding: "6px 4px" }}></th>
                </tr>
              </thead>
              <tbody>
                {assets.map((a) => (
                  <tr key={a.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "8px 4px", textTransform: "capitalize" }}>{a.kind}</td>
                    <td style={{ padding: "8px 4px" }}>
                      <a href={a.url} target="_blank" rel="noreferrer" style={{ color: "var(--text)" }}>{a.title}</a>
                      {a.description && <div style={{ color: "var(--muted)", fontSize: 12 }}>{a.description}</div>}
                    </td>
                    <td style={{ padding: "8px 4px" }}>
                      <button className="link" onClick={() => toggleActive(a)}>
                        {a.active ? "✅ Active" : "⏸ Hidden"}
                      </button>
                    </td>
                    <td style={{ padding: "8px 4px", textAlign: "right" }}>
                      <button className="link" onClick={() => remove(a)} style={{ color: "var(--danger, #ef4444)" }}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>
    </div>
  );
}
