"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export type SpeaksAs = "f" | "m" | "neutral";

/**
 * How this telecaller refers to THEMSELVES in generated Hindi messages.
 *
 * Hindi conjugates the first person, so "main baat kar raha hoon" is a claim
 * about the sender, not the lead. Every ready-made opener used to be masculine,
 * which was wrong for most of the team — so the buyer's very first message was
 * wrong about the person sending it.
 *
 * It is set here (or by the rep in their own app), never guessed from a name:
 * a guess misgenders real people. Left unset it stays on the neutral plural
 * ("kar rahe hain"), which is ordinary polite business Hindi and correct for
 * everyone.
 */
const OPTIONS: { key: SpeaksAs; label: string; sample: string }[] = [
  { key: "f", label: "Female", sample: "kar rahi hoon" },
  { key: "m", label: "Male", sample: "kar raha hoon" },
  { key: "neutral", label: "Neutral", sample: "kar rahe hain" },
];

export function SpeaksAsPicker({ userId, value }: { userId: string; value: string | null }) {
  const router = useRouter();
  const [current, setCurrent] = useState<string>(value ?? "neutral");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function pick(next: SpeaksAs) {
    if (next === current) return;
    const previous = current;
    setCurrent(next);
    setBusy(true);
    setErr(null);
    const supabase = createClient();
    const { error } = await supabase.from("profiles").update({ speaks_as: next }).eq("id", userId);
    setBusy(false);
    if (error) {
      setCurrent(previous);
      setErr(error.message);
      return;
    }
    router.refresh();
  }

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", gap: 3 }}>
      <div style={{ display: "inline-flex", gap: 4 }}>
        {OPTIONS.map((o) => {
          const on = current === o.key;
          return (
            <button
              key={o.key}
              onClick={() => pick(o.key)}
              disabled={busy}
              title={`"${o.sample}"`}
              style={{
                padding: "3px 9px",
                borderRadius: 999,
                cursor: busy ? "wait" : "pointer",
                fontSize: 11.5,
                fontWeight: on ? 700 : 500,
                whiteSpace: "nowrap",
                border: `1px solid ${on ? "var(--accent)" : "var(--border)"}`,
                background: on ? "rgba(99,102,241,0.15)" : "rgba(255,255,255,0.03)",
                color: on ? "var(--accent)" : "var(--muted)",
              }}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {err && <span style={{ fontSize: 11, color: "var(--bad)" }}>{err}</span>}
    </div>
  );
}
