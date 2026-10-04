"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
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
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setSlot(document.getElementById("company-picker-slot"));
  }, []);
  const control = (
    <div className="company-picker">
      <span className="company-picker-label">Company</span>
      <select
        value={selected ?? ""}
        onChange={(e) => {
          const next = new URLSearchParams(params.toString());
          next.set("company", e.target.value);
          router.push(`${pathname}?${next.toString()}`);
        }}
      >
        {companies.length === 0 && <option value="">No companies</option>}
        {companies.map((c) => <option key={c.id} value={c.id}>{c.name ?? c.id}</option>)}
      </select>
    </div>
  );
  if (slot) return createPortal(control, slot);
  return control;
}
