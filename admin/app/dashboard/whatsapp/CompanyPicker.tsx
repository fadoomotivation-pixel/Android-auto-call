"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Super-admin company selector, shared by every dashboard page that scopes to
 * one company via a `?company=` search param. It stays on the CURRENT page
 * (never hardcode a path here — this used to jump every page to /whatsapp)
 * and preserves the other search params (month, range…).
 */
export function CompanyPicker({
  companies, selected,
}: { companies: { id: string; name: string | null }[]; selected: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
      <span style={{ fontSize: 13, color: "var(--muted)" }}>Company:</span>
      <select
        value={selected ?? ""}
        onChange={(e) => {
          const next = new URLSearchParams(params.toString());
          next.set("company", e.target.value);
          router.push(`${pathname}?${next.toString()}`);
        }}
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
