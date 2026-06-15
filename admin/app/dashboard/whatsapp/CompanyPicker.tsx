"use client";

import { useRouter } from "next/navigation";

export function CompanyPicker({
  companies, selected,
}: { companies: { id: string; name: string | null }[]; selected: string | null }) {
  const router = useRouter();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
      <span style={{ fontSize: 13, color: "var(--muted)" }}>Company:</span>
      <select
        value={selected ?? ""}
        onChange={(e) => router.push(`/dashboard/whatsapp?company=${e.target.value}`)}
        style={{
          padding: "8px 10px", borderRadius: 6, border: "1px solid var(--border)",
          background: "var(--panel-2)", color: "var(--text)", minWidth: 220,
        }}
      >
        {companies.length === 0 && <option value="">No companies</option>}
        {companies.map((c) => <option key={c.id} value={c.id}>{c.name ?? c.id}</option>)}
      </select>
    </div>
  );
}
