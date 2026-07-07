"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Company = { id: string; name: string };

// Per-employee company picker. Changing it moves the telecaller to another
// company via platform_reassign_employee (super-admin RPC), which also releases
// their leads/campaigns/pending reminders in the company they are leaving.
export function AssignCompany({
  userId,
  name,
  companyId,
  companies,
}: {
  userId: string;
  name: string;
  companyId: string | null;
  companies: Company[];
}) {
  const router = useRouter();
  const [value, setValue] = useState(companyId ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onChange(next: string) {
    if (!next || next === (companyId ?? "")) return;
    const target = companies.find((c) => c.id === next);
    const ok = window.confirm(
      `Move ${name || "this telecaller"} to ${target?.name ?? "this company"}?\n\n` +
        `Their leads, campaigns and pending reminders in the current company will be released.`,
    );
    if (!ok) return;

    setBusy(true);
    setErr(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("platform_reassign_employee", {
      p_user: userId,
      p_company: next,
    });
    setBusy(false);
    if (error) {
      setErr(error.message.includes("not_authorized") ? "Super admin only." : error.message);
      setValue(companyId ?? "");
      return;
    }
    setValue(next);
    router.refresh();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <select
        value={value}
        disabled={busy}
        onChange={(e) => onChange(e.target.value)}
        aria-label={`Company for ${name}`}
        style={{
          padding: "6px 10px",
          borderRadius: 8,
          border: "1px solid var(--border)",
          background: "var(--panel-2)",
          color: "var(--text)",
          minWidth: 150,
          cursor: busy ? "wait" : "pointer",
        }}
      >
        {value === "" && <option value="">— Unassigned —</option>}
        {companies.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      {busy && <span className="subtitle" style={{ fontSize: 12 }}>Moving…</span>}
      {err && <span className="error" style={{ fontSize: 12 }}>{err}</span>}
    </div>
  );
}
