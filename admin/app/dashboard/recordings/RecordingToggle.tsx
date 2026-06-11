"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function RecordingToggle({ companyId, enabled }: { companyId: string; enabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    const supabase = createClient();
    await supabase.from("companies").update({ recording_enabled: !enabled }).eq("id", companyId);
    setBusy(false);
    router.refresh();
  }

  return (
    <div style={{ margin: "8px 0 16px", display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ fontWeight: 600 }}>Call recording:</span>
      <span className={`badge ${enabled ? "connected" : ""}`}>{enabled ? "On" : "Off"}</span>
      <button className="link" onClick={toggle} disabled={busy}>
        {busy ? "…" : enabled ? "Turn off" : "Turn on"}
      </button>
    </div>
  );
}
