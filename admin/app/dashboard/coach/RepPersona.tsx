"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ist } from "@/lib/dashboard/format";

type Persona = {
  summary: string;
  how_she_sounds: string;
  how_she_sells: string;
  strengths: string[];
  watch_out: string[];
  her_phrases: string[];
};
type Resp = {
  ok: boolean; error?: string; persona: Persona | null;
  built_from: { calls: number; messages: number } | null; built_at: string | null;
};

/**
 * How a telecaller sounds and sells, as her own recorded calls and WhatsApp
 * messages show it. Rebuilt every night by rep-persona from her newest calls;
 * the after-call WhatsApp is written in this voice. Collapsed until asked for —
 * it is a profile of a person, not a number to glance at.
 */
export function RepPersona({ salespersonId, name }: { salespersonId: string; name: string }) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Resp | null>(null);
  const [busy, setBusy] = useState(false);

  async function load(mode: "get" | "rebuild") {
    setBusy(true);
    const { data: d, error } = await supabase.functions.invoke<Resp>("rep-persona", {
      body: { mode, salesperson_id: salespersonId },
    });
    setBusy(false);
    setData(error || !d ? { ok: false, error: error?.message ?? "Couldn't load it.", persona: null, built_from: null, built_at: null } : d);
  }

  const small = { fontSize: "var(--text-caption1)", color: "var(--muted)" } as const;
  const row = { fontSize: "var(--text-footnote)", color: "var(--text)", lineHeight: 1.5, margin: "4px 0 0" } as const;

  if (!open) {
    return (
      <button className="link" style={{ marginTop: 6 }} onClick={() => { setOpen(true); if (!data) void load("get"); }}>
        How {name} sounds and sells
      </button>
    );
  }

  const p = data?.persona;
  return (
    <div style={{ marginTop: 8, borderTop: "1px solid var(--border)", paddingTop: 8 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
        <strong style={{ color: "var(--text)", fontSize: "var(--text-footnote)" }}>How {name} sounds and sells</strong>
        {data?.built_at && (
          <span style={small}>
            From {data.built_from?.calls ?? 0} recorded calls and {data.built_from?.messages ?? 0} of their messages ·
            {" "}{ist(data.built_at)}
          </span>
        )}
        <button className="link" onClick={() => setOpen(false)} style={{ marginLeft: "auto" }}>Hide</button>
      </div>
      {busy && <div style={small} role="status">Reading their calls…</div>}
      {!busy && data && !data.ok && <div style={{ ...small, color: "var(--bad)" }}>{data.error}</div>}
      {!busy && data?.ok && !p && (
        <div style={small}>
          Not built yet. It needs 5 or more recorded calls in the last 3 weeks, and is rebuilt every night.
        </div>
      )}
      {p && (
        <>
          <p style={row}>{p.summary}</p>
          {p.how_she_sounds && <p style={row}><strong>Sounds:</strong> {p.how_she_sounds}</p>}
          {p.how_she_sells && <p style={row}><strong>Sells:</strong> {p.how_she_sells}</p>}
          {p.strengths.length > 0 && <p style={{ ...row, color: "var(--good)" }}><strong>Good at:</strong> {p.strengths.join(" · ")}</p>}
          {p.watch_out.length > 0 && <p style={{ ...row, color: "var(--warn)" }}><strong>Watch out:</strong> {p.watch_out.join(" · ")}</p>}
          {p.her_phrases.length > 0 && <p style={row}><strong>Their words:</strong> {p.her_phrases.map((x) => `“${x}”`).join("  ")}</p>}
        </>
      )}
      <button className="link" style={{ marginTop: 6 }} disabled={busy} onClick={() => void load("rebuild")}>
        Build it again from the latest calls
      </button>
    </div>
  );
}
