"use client";

/**
 * Add a telecaller's WhatsApp number, here, where you found out it was missing.
 *
 * Eight of nine telecallers have no phone number on their profile, so the daily
 * review reaches nobody. The page already SAID that — and then sent the reader
 * to another page to fix it. Being told what is wrong and having to go
 * somewhere else to correct it is how a two-minute job becomes a job nobody
 * does; the row that reports the problem is the right place to solve it.
 *
 * No migration was needed: profiles' existing RLS already lets a super admin
 * update any profile and a company admin update their own company's. This is a
 * UI that was missing, not a permission that was.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Digits only, and India's country code when it is obviously a local number.
 *
 * WhatsApp needs 91XXXXXXXXXX. A rep typing the number off a SIM card writes
 * ten digits, and a manager copying from a contact card pastes "+91 98765
 * 43210" — both have to arrive at the same stored value or the same person
 * ends up with two identities in the outbox.
 */
export function normalisePhone(raw: string): { ok: true; value: string } | { ok: false; why: string } {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return { ok: false, why: "Enter a number." };
  // 10-digit Indian mobiles start 6-9. Anything shorter is a typo, not a number.
  if (digits.length === 10) {
    if (!/^[6-9]/.test(digits)) return { ok: false, why: "An Indian mobile starts with 6, 7, 8 or 9." };
    return { ok: true, value: `91${digits}` };
  }
  if (digits.length === 12 && digits.startsWith("91")) {
    if (!/^[6-9]/.test(digits.slice(2))) return { ok: false, why: "An Indian mobile starts with 6, 7, 8 or 9." };
    return { ok: true, value: digits };
  }
  // Not Indian, but a real international number — accept rather than block a
  // company we have not met yet.
  if (digits.length >= 11 && digits.length <= 15) return { ok: true, value: digits };
  return { ok: false, why: "That does not look like a phone number." };
}

export function AddPhone({
  salespersonId, name, current,
}: {
  salespersonId: string;
  name: string;
  /** Existing number, if any. Present means this is an edit, not an add. */
  current: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(current ?? "");
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const [why, setWhy] = useState<string | null>(null);

  async function save() {
    const parsed = normalisePhone(value);
    if (!parsed.ok) { setState("error"); setWhy(parsed.why); return; }
    setState("saving");
    setWhy(null);
    const supabase = createClient();
    const { error } = await supabase.from("profiles")
      .update({ phone: parsed.value }).eq("id", salespersonId);
    if (error) {
      setState("error");
      // RLS is the likely refusal, and "permission denied" tells a manager
      // nothing they can act on.
      setWhy(/row-level|permission/i.test(error.message)
        ? "You can only edit telecallers in your own company."
        : error.message);
      return;
    }
    setState("idle");
    setOpen(false);
    // The enrolment list is server-rendered from v_rep_review_recipients, so
    // the row has to be re-read to show "enrolled" rather than patched locally
    // — a local patch would claim enrolment the view has not agreed to.
    router.refresh();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          fontSize: 11.5, padding: "3px 10px", borderRadius: 7, cursor: "pointer",
          border: `1px solid ${current ? "rgba(255,255,255,0.14)" : "var(--accent)"}`,
          background: current ? "rgba(255,255,255,0.05)" : "var(--accent)",
          color: current ? "var(--text)" : "#fff", whiteSpace: "nowrap",
        }}
      >
        {current ? "Edit number" : "➕ Add phone number"}
      </button>
    );
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <input
        autoFocus
        value={value}
        onChange={(e) => { setValue(e.target.value); setState("idle"); setWhy(null); }}
        onKeyDown={(e) => { if (e.key === "Enter") void save(); if (e.key === "Escape") setOpen(false); }}
        placeholder="98765 43210"
        inputMode="tel"
        aria-label={`WhatsApp number for ${name}`}
        style={{
          fontSize: 12.5, padding: "4px 9px", borderRadius: 7, width: 150,
          border: "1px solid rgba(255,255,255,0.2)", background: "rgba(0,0,0,0.3)",
          color: "var(--text)",
        }}
      />
      <button onClick={() => void save()} disabled={state === "saving"}
        style={{
          fontSize: 11.5, padding: "4px 11px", borderRadius: 7, cursor: "pointer",
          border: "1px solid var(--accent)", background: "var(--accent)", color: "#fff",
        }}>
        {state === "saving" ? "Saving…" : "Save"}
      </button>
      <button onClick={() => { setOpen(false); setValue(current ?? ""); setState("idle"); setWhy(null); }}
        style={{
          fontSize: 11.5, padding: "4px 9px", borderRadius: 7, cursor: "pointer",
          border: "1px solid rgba(255,255,255,0.14)", background: "transparent", color: "var(--muted)",
        }}>
        Cancel
      </button>
      {why && <span style={{ fontSize: 11.5, color: "#fca5a5", flexBasis: "100%" }}>{why}</span>}
    </span>
  );
}
