"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function CoachPanel() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { data, error } = await supabase.functions.invoke<{ ok: boolean; error?: string }>(
      "manager-digest",
      { body: {} },
    );
    setBusy(false);
    if (error || !data?.ok) {
      setError(data?.error || error?.message || "Couldn't generate the digest.");
      return;
    }
    router.refresh();
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "12px 0" }}>
      <button className="primary" onClick={generate} disabled={busy}>
        {busy ? "Generating…" : "✨ Generate today's digest"}
      </button>
      {error && <span className="error" style={{ fontSize: 13 }}>{error}</span>}
    </div>
  );
}
