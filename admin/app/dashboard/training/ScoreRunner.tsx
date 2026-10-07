"use client";

/**
 * Runs training-picks until every candidate has been read.
 *
 * The loop lives here rather than in the function for the reason knowledge-ingest
 * already paid for: one Groq round trip per call, and a whole library in one
 * request blows the edge CPU budget and comes back as HTTP 546 — which looks
 * exactly like the model being down. So the function does a handful and says
 * how many are left, and this keeps asking.
 *
 * It shows the remaining count, not a spinner. A spinner on a job that takes
 * four minutes is indistinguishable from a job that has died.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Reply = {
  ok: boolean;
  error?: string;
  scored: number;
  skipped: number;
  done: boolean;
  next_offset: number;
  remaining: number;
  model: string | null;
  errors: string[];
};

export function ScoreRunner({ companyId, unread }: { companyId: string | null; unread: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState<number | null>(null);
  const [done, setDone] = useState<number>(0);
  const [note, setNote] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setNote(null);
    setDone(0);
    const supabase = createClient();
    let offset = 0;
    let total = 0;

    // A hard stop. Without it a function that keeps returning done:false — a
    // write that silently fails, say — spins forever against a paid API.
    for (let pass = 0; pass < 80; pass++) {
      const { data, error } = await supabase.functions.invoke<Reply>("training-picks", {
        body: { ...(companyId ? { company_id: companyId } : {}), offset },
      });
      if (error || !data?.ok) {
        setNote(data?.error || error?.message || "Could not read the calls.");
        break;
      }
      total += data.scored;
      setDone(total);
      setLeft(data.remaining);
      // Every failure the function reported, shown rather than counted. A run
      // that read 20 calls and failed on 4 is not a successful run.
      if (data.errors?.length) setNote(data.errors.slice(0, 2).join(" · "));
      if (data.done || (data.scored === 0 && data.skipped === 0)) break;
      offset = data.next_offset;
    }

    setBusy(false);
    router.refresh();
  }

  if (unread === 0 && !busy && done === 0) {
    return <p className="subtitle">Every call in this library has been read.</p>;
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", margin: "8px 0 20px" }}>
      <button className="btn-ghost" onClick={run} disabled={busy}>
        {busy ? "Reading…" : `Read ${unread} call${unread === 1 ? "" : "s"}`}
      </button>
      {busy && (
        <span className="subtitle" style={{ margin: 0 }}>
          {done} read{left !== null ? `, ${left} to go` : ""}. This takes a few minutes — leave the page open.
        </span>
      )}
      {!busy && done > 0 && (
        <span className="subtitle" style={{ margin: 0 }}>Read {done}.</span>
      )}
      {note && <span className="subtitle" style={{ margin: 0, color: "var(--warn)" }}>{note}</span>}
    </div>
  );
}
