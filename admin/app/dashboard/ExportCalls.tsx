"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

function cell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function ExportCalls({ names }: { names: Record<string, string> }) {
  const [busy, setBusy] = useState(false);

  async function exportCsv() {
    setBusy(true);
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from("call_logs")
        .select("created_at,salesperson_id,phone,outcome,duration_seconds,sim_slot,notes")
        .order("created_at", { ascending: false })
        .limit(20000);

      const rows = data ?? [];
      const header = ["date", "salesperson", "phone", "outcome", "duration_seconds", "sim_slot", "notes"];
      const lines = [
        header.join(","),
        ...rows.map((r: Record<string, unknown>) =>
          [
            cell(r.created_at),
            cell(names[r.salesperson_id as string] ?? ""),
            cell(r.phone),
            cell(r.outcome),
            cell(r.duration_seconds),
            cell(r.sim_slot),
            cell(r.notes),
          ].join(","),
        ),
      ];
      const blob = new Blob([lines.join("\n")], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `call_logs_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button className="primary" style={{ width: "auto", padding: "10px 16px" }} onClick={exportCsv} disabled={busy}>
      {busy ? "Exporting…" : "⬇ Export calls (CSV)"}
    </button>
  );
}
