"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function AgentAssign({
  userId,
  agentId,
  callerId,
}: {
  userId: string;
  agentId: string | null;
  callerId: string | null;
}) {
  const router = useRouter();
  const [a, setA] = useState(agentId ?? "");
  const [c, setC] = useState(callerId ?? "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setBusy(true);
    setSaved(false);
    const supabase = createClient();
    await supabase
      .from("profiles")
      .update({ sip_agent_id: a.trim() || null, caller_id: c.trim() || null })
      .eq("id", userId);
    setBusy(false);
    setSaved(true);
    router.refresh();
    setTimeout(() => setSaved(false), 1500);
  }

  const input: React.CSSProperties = {
    width: 90,
    padding: "6px 8px",
    borderRadius: 6,
    border: "1px solid var(--border)",
    background: "var(--panel-2)",
    color: "var(--text)",
  };

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <input style={input} placeholder="ext" value={a} onChange={(e) => setA(e.target.value)} />
      <input style={{ ...input, width: 120 }} placeholder="caller ID" value={c} onChange={(e) => setC(e.target.value)} />
      <button className="link" onClick={save} disabled={busy} style={{ color: "var(--accent)" }}>
        {busy ? "…" : saved ? "Saved ✓" : "Save"}
      </button>
    </div>
  );
}
