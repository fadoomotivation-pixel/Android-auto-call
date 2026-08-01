"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * One number that can send for every company.
 *
 * Seven of the eight companies here have no WhatsApp app of their own, and a
 * new customer is not going to build one in Meta before their founder can start
 * getting a daily report — the same objection already raised about Google Drive:
 * it all lands in one place, so why connect it separately every time.
 *
 * So the super admin names ONE connected company as the platform's sender, the
 * way one central Facebook ad account already runs ads for everyone. A company
 * with its own number keeps using it; the rest borrow this one.
 *
 * Only the sending pipe is shared. Each founder still receives their OWN
 * company's report and nothing else.
 */
export function PlatformSender({ companies }: { companies: { id: string; name: string | null }[] }) {
  const supabase = createClient();
  const [current, setCurrent] = useState<string | null>(null);
  const [connected, setConnected] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [{ data: pw }, { data: integs }] = await Promise.all([
      supabase.from("platform_whatsapp").select("company_id").maybeSingle(),
      // A company can only be the sender if it actually has a token stored —
      // offering one that can't send just moves the failure to 7pm.
      supabase.from("whatsapp_integrations").select("company_id, active, access_token_secret_id"),
    ]);
    setCurrent(pw?.company_id ?? null);
    setConnected(new Set(
      (integs ?? []).filter((i) => i.active && i.access_token_secret_id).map((i) => i.company_id as string),
    ));
  }, [supabase]);

  useEffect(() => { void load(); }, [load]);

  async function save(companyId: string) {
    setBusy(true); setMsg(null);
    const { error } = companyId
      ? await supabase.from("platform_whatsapp").upsert({ only_row: true, company_id: companyId, updated_at: new Date().toISOString() }, { onConflict: "only_row" })
      : await supabase.from("platform_whatsapp").delete().eq("only_row", true);
    setBusy(false);
    if (error) { setMsg(error.message); return; }
    setMsg(companyId ? "Saved — companies without their own number will send through this one." : "Cleared.");
    void load();
  }

  const usable = companies.filter((c) => connected.has(c.id));

  return (
    <div style={{ border: "1px solid rgba(37,211,102,0.3)", background: "rgba(37,211,102,0.05)", borderRadius: 12, padding: 14, margin: "12px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <strong style={{ color: "#fff", fontSize: 14 }}>🌐 Platform sending number</strong>
        <span style={{ fontSize: 12.5, color: "var(--muted)" }}>
          Used for any company that hasn&apos;t connected its own WhatsApp — one number for the whole platform,
          like the shared ad account. Each founder still only gets their own company&apos;s report.
        </span>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
        <select
          value={current ?? ""}
          onChange={(e) => save(e.target.value)}
          disabled={busy}
          style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)", background: "var(--panel)", color: "var(--text)", fontSize: 13 }}
        >
          <option value="">— none —</option>
          {usable.map((c) => <option key={c.id} value={c.id}>{c.name ?? c.id}</option>)}
        </select>
        {msg && <span style={{ fontSize: 12.5, color: msg.startsWith("Saved") || msg === "Cleared." ? "#22c55e" : "#f87171" }}>{msg}</span>}
      </div>

      {usable.length === 0 && (
        <div style={{ marginTop: 10, fontSize: 12.5, color: "#fcd34d", background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 8, padding: "8px 10px", lineHeight: 1.5 }}>
          No company has a working WhatsApp connection yet — a number is set up, but its access token was never
          saved, so nothing can send. Fill in the token below and save; then this list will have something to pick.
        </div>
      )}
    </div>
  );
}
