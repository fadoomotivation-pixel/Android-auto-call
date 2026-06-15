"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function CallSummary({ callId, initial }: { callId: string; initial: string | null }) {
  const [summary, setSummary] = useState<string | null>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { data, error } = await supabase.functions.invoke<{ ok: boolean; summary?: string; error?: string }>(
      "call-summary",
      { body: { call_log_id: callId } },
    );
    setBusy(false);
    if (error || !data?.ok) {
      setError(data?.error || error?.message || "Summary failed");
      return;
    }
    setSummary(data.summary ?? "");
  }

  if (summary) {
    return <div style={{ fontSize: 13, whiteSpace: "pre-wrap", maxWidth: 360 }}>{summary}</div>;
  }
  return (
    <div>
      <button className="link" style={{ color: "var(--accent)" }} onClick={run} disabled={busy}>
        {busy ? "Summarizing…" : "✨ AI summary"}
      </button>
      {error && <div className="error" style={{ fontSize: 12, marginTop: 4 }}>{error}</div>}
    </div>
  );
}
