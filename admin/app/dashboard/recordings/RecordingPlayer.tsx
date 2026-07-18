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
      // Fetch the edge function directly (with the session token) and read the
      // response as a Blob — this preserves the SERVER's real Content-Type
      // (audio/mp4, audio/wav, audio/amr…) so the browser picks the right
      // decoder. supabase-js invoke would mis-tag the bytes.
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/recording-url`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            Authorization: `Bearer ${session?.access_token ?? ""}`,
          },
          body: JSON.stringify({ call_log_id: callId }),
        },
      );
      if (!res.ok) throw new Error(`Couldn't load recording (${res.status})`);
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
          onError={() => setErr("This recording's format won't play in a browser (e.g. .amr from the phone's recorder). It plays in the app. Tip: record via the app's built-in recorder or cloud calling for m4a/wav.")}
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
