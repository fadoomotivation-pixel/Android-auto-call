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
    <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "24px 0" }}>
      <button 
        className="primary hover-scale" 
        onClick={generate} 
        disabled={busy}
        style={{
          width: "100%",
          padding: "16px 24px",
          fontSize: 16,
          fontWeight: 700,
          letterSpacing: "0.5px",
          background: "linear-gradient(135deg, var(--accent), #10B981)",
          boxShadow: "0 8px 32px rgba(16, 185, 129, 0.4)",
          border: "1px solid rgba(255,255,255,0.2)",
          borderRadius: 12,
          transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
          textShadow: "0 2px 4px rgba(0,0,0,0.2)"
        }}
      >
        {busy ? "Generating…" : "✨ Generate today's digest"}
      </button>
      {error && <span className="error" style={{ fontSize: 13 }}>{error}</span>}
    </div>
  );
}
