"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function IntegrationEditor({
  companyId,
  token,
  tenantId,
  callerId,
}: {
  companyId: string;
  token: string | null;
  tenantId: string | null;
  callerId: string | null;
}) {
  const router = useRouter();
  const [t, setT] = useState(token ?? "");
  const [ten, setTen] = useState(tenantId ?? "");
  const [cid, setCid] = useState(callerId ?? "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setBusy(true);
    setSaved(false);
    const supabase = createClient();
    await supabase.from("company_integrations").upsert({
      company_id: companyId,
      uro_token: t.trim() || null,
      uro_tenant_id: ten.trim() || null,
      default_caller_id: cid.trim() || null,
      updated_at: new Date().toISOString(),
    });
    setBusy(false);
    setSaved(true);
    router.refresh();
    setTimeout(() => setSaved(false), 1500);
  }

  const input: React.CSSProperties = {
    padding: "7px 9px",
    borderRadius: 6,
    border: "1px solid var(--border)",
    background: "var(--panel-2)",
    color: "var(--text)",
  };

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <input style={{ ...input, width: 220 }} placeholder="uroperator FS_ token" value={t} onChange={(e) => setT(e.target.value)} />
      <input style={{ ...input, width: 90 }} placeholder="tenant id" value={ten} onChange={(e) => setTen(e.target.value)} />
      <input style={{ ...input, width: 130 }} placeholder="number / DID" value={cid} onChange={(e) => setCid(e.target.value)} />
      <button className="primary" style={{ width: "auto", padding: "8px 14px" }} onClick={save} disabled={busy}>
        {busy ? "…" : saved ? "Saved ✓" : "Save"}
      </button>
    </div>
  );
}
