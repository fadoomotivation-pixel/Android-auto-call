"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function RecordingPlayer({ callId, canDelete }: { callId: string; canDelete: boolean }) {
  const router = useRouter();
  const [src, setSrc] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setBusy(true);
    setErr(null);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.functions.invoke("recording-url", {
        body: { call_log_id: callId },
      });
      if (error) throw error;
      // The function streams audio bytes; supabase-js returns them as a Blob.
      const blob = data instanceof Blob ? data : new Blob([data as BlobPart], { type: "audio/x-matroska" });
      setSrc(URL.createObjectURL(blob));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't load recording");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm("Delete this recording permanently?")) return;
    setBusy(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.functions.invoke("recording-delete", {
        body: { call_log_id: callId },
      });
      if (error) throw error;
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Delete failed");
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {src ? (
        <audio controls autoPlay src={src} style={{ height: 32 }} />
      ) : (
        <button className="link" onClick={load} disabled={busy}>
          {busy ? "Loading…" : "▶ Play"}
        </button>
      )}
      {canDelete && (
        <button className="link" style={{ color: "var(--danger, #d7263d)" }} onClick={remove} disabled={busy}>
          Delete
        </button>
      )}
      {err && <span className="error" style={{ fontSize: 12 }}>{err}</span>}
    </div>
  );
}
