"use client";

import { useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { createClient } from "@/lib/supabase/client";

interface Check {
  company_id: string; company_name?: string | null;
  ok: boolean; state: string; headline: string; fix?: string;
  number?: string | null; name?: string | null; quality?: string | null;
}

const TONE: Record<string, string> = {
  connected: "#22c55e", not_set_up: "#86868B", inactive: "#f59e0b",
  token_missing: "#ef4444", token_expired: "#ef4444", wrong_id: "#ef4444", error: "#ef4444",
};
const LABEL: Record<string, string> = {
  connected: "Working", not_set_up: "Not set up", inactive: "Switched off",
  token_missing: "Token missing", token_expired: "Token expired", wrong_id: "Wrong ID", error: "Error",
};

/**
 * WhatsApp health — the difference between "I pasted something" and "it works".
 *
 * Setup fails silently: one wrong character in the phone number ID or an expired
 * token and messages simply never send. This asks Meta directly and says, in one
 * plain sentence, whether it works and what to fix. For the super admin it also
 * lists EVERY company at once, so a broken one can't hide in a long list.
 */
export function WhatsAppHealth({ isSuper, companyId }: { isSuper: boolean; companyId: string | null }) {
  const supabase = createClient();
  const [one, setOne] = useState<Check | null>(null);
  const [all, setAll] = useState<Check[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const runOne = useCallback(async () => {
    if (!companyId) return;
    setBusy(true); setErr(null);
    const { data, error } = await supabase.functions.invoke<{ ok: boolean; error?: string; check?: Check }>(
      "whatsapp-verify", { body: { company_id: companyId } },
    );
    setBusy(false);
    if (error || !data?.ok || !data.check) { setErr(data?.error || error?.message || "Couldn't check."); return; }
    setOne(data.check);
  }, [supabase, companyId]);

  const runAll = useCallback(async () => {
    setBusy(true); setErr(null);
    const { data, error } = await supabase.functions.invoke<{ ok: boolean; error?: string; checks?: Check[] }>(
      "whatsapp-verify", { body: { mode: "all" } },
    );
    setBusy(false);
    if (error || !data?.ok) { setErr(data?.error || error?.message || "Couldn't check."); return; }
    setAll(data.checks ?? []);
  }, [supabase]);

  // Check on open: the owner should see the truth without hunting for a button.
  useEffect(() => { void (isSuper ? runAll() : runOne()); }, [isSuper, runAll, runOne]);

  const card: CSSProperties = { background: "var(--panel-grad, var(--panel))", border: "1px solid var(--border)", borderRadius: 18, padding: 20, marginBottom: 16 };
  const pill = (state: string): CSSProperties => ({
    fontSize: 11, fontWeight: 700, color: TONE[state] ?? "var(--muted)",
    border: `1px solid ${TONE[state] ?? "var(--border)"}`, borderRadius: 999, padding: "2px 9px", whiteSpace: "nowrap",
  });

  const working = all?.filter((c) => c.ok).length ?? 0;
  const broken = all ? all.filter((c) => !c.ok && c.state !== "not_set_up").length : 0;
  const missing = all ? all.filter((c) => c.state === "not_set_up").length : 0;

  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <strong style={{ color: "#fff", fontSize: 15 }}>🩺 Connection check</strong>
        {all && (
          <span style={{ fontSize: 13, color: "var(--muted)" }}>
            <span style={{ color: "#22c55e", fontWeight: 700 }}>{working} working</span>
            {broken > 0 && <> · <span style={{ color: "#ef4444", fontWeight: 700 }}>{broken} broken</span></>}
            {missing > 0 && <> · {missing} not set up</>}
          </span>
        )}
        <button className="link" style={{ marginLeft: "auto" }} onClick={() => (isSuper ? runAll() : runOne())} disabled={busy}>
          {busy ? "Checking…" : "Check again"}
        </button>
      </div>

      {err && <div className="error" style={{ marginTop: 10 }}>{err}</div>}

      {/* Single company (company admin, or the super admin's selected company) */}
      {one && (
        <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "flex-start" }}>
          <span style={pill(one.state)}>{LABEL[one.state] ?? one.state}</span>
          <div>
            <div style={{ color: "#fff", fontSize: 14, fontWeight: 600 }}>{one.headline}</div>
            {one.fix && <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>👉 {one.fix}</div>}
          </div>
        </div>
      )}

      {/* Every company at once — nothing broken can hide in a long list. */}
      {all && all.length > 0 && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          {[...all].sort((a, b) => Number(a.ok) - Number(b.ok)).map((c) => (
            <div key={c.company_id} style={{ display: "flex", gap: 10, alignItems: "flex-start", paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
              <span style={pill(c.state)}>{LABEL[c.state] ?? c.state}</span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ color: "#fff", fontSize: 13.5, fontWeight: 600 }}>
                  {c.company_name ?? "Company"}
                  {c.number && <span style={{ color: "var(--muted)", fontWeight: 400 }}> · {c.number}</span>}
                </div>
                {!c.ok && <div style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 3 }}>{c.headline} {c.fix ? `👉 ${c.fix}` : ""}</div>}
              </div>
              <a href={`/dashboard/whatsapp?company=${c.company_id}`} style={{ fontSize: 12.5, color: "var(--accent)", whiteSpace: "nowrap" }}>Open</a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
