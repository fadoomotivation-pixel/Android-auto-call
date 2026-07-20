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
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/audio-proxy?callId=${callId}`, {
        headers: {
          Authorization: `Bearer ${session?.access_token ?? ""}`
        }
      });
      if (!res.ok) {
        const text = (await res.text().catch(() => "")).trim();
        // A framework-level crash returns an HTML error page — don't dump that
        // markup into the table; show a concise status instead.
        const clean = !text || text.startsWith("<") || text.length > 200
          ? `Couldn't load recording (${res.status})`
          : text;
        throw new Error(clean);
      }
      const blob = await res.blob();
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
        <audio
          controls
          autoPlay
          src={src}
          style={{ height: 32 }}
          onError={() => setErr("Could not play the audio file.")}
        />
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