"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type VoiceNote = {
  id: string;
  actor_name: string | null;
  audio_path: string;
  duration_seconds: number;
  transcript: string | null;
  summary: string | null;
  suggested_disposition: string | null;
  ai_status: string;
  created_at: string;
  url?: string; // signed playback URL
};

export function LeadHistory({ contactId, onClose }: { contactId: string; onClose: () => void }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [notes, setNotes] = useState<VoiceNote[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const [callsRes, notesRes] = await Promise.all([
        supabase
          .from("call_logs")
          .select("id, outcome, duration_seconds, notes, summary, created_at, salesperson_id")
          .eq("contact_id", contactId)
          .order("created_at", { ascending: false }),
        supabase
          .from("lead_voice_notes")
          .select("id, actor_name, audio_path, duration_seconds, transcript, summary, suggested_disposition, ai_status, created_at")
          .eq("contact_id", contactId)
          .order("created_at", { ascending: false }),
      ]);
      setLogs(callsRes.data || []);

      // Private bucket → short-lived signed URLs for the <audio> players.
      const vns: VoiceNote[] = (notesRes.data as VoiceNote[]) || [];
      const signed = await Promise.all(
        vns.map(async (n) => {
          const { data } = await supabase.storage.from("voice-notes").createSignedUrl(n.audio_path, 3600);
          return { ...n, url: data?.signedUrl };
        }),
      );
      setNotes(signed);
      setLoading(false);
    }
    load();
  }, [contactId, supabase]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
       <div className="card" style={{ width: "100%", maxWidth: 600, maxHeight: "80vh", overflowY: "auto", background: "var(--panel)", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 24px 64px rgba(0,0,0,0.5)" }}>
         <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, borderBottom: "1px solid rgba(255,255,255,0.1)", paddingBottom: 16 }}>
           <h3 style={{ margin: 0, color: "#fff" }}>Interaction History</h3>
           <button className="primary" style={{ background: "rgba(255,255,255,0.1)", color: "#fff", border: "none", padding: "6px 12px" }} onClick={onClose}>Close</button>
         </div>

         {loading ? (
           <div style={{ color: "var(--muted)", textAlign: "center", padding: 40 }}>Loading history...</div>
         ) : (
           <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
             {notes.length > 0 && (
               <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, color: "var(--muted)", textTransform: "uppercase" }}>
                 🎤 Telecaller voice notes
               </div>
             )}
             {notes.map((n) => (
               <div key={n.id} style={{ padding: 16, background: "rgba(139, 92, 246, 0.06)", borderRadius: 12, border: "1px solid rgba(139, 92, 246, 0.18)" }}>
                 <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8, display: "flex", justifyContent: "space-between" }}>
                   <span>🎤 {n.actor_name || "Telecaller"} · {new Date(n.created_at).toLocaleString()}</span>
                   <span>⏱️ {n.duration_seconds}s</span>
                 </div>
                 {n.url ? (
                   <audio controls preload="none" src={n.url} style={{ width: "100%", height: 36 }} />
                 ) : (
                   <div style={{ fontSize: 13, color: "var(--muted)" }}>Audio unavailable</div>
                 )}
                 {n.summary && (
                   <div style={{ marginTop: 10, fontSize: 14, color: "var(--text)", background: "rgba(139, 92, 246, 0.08)", padding: "10px 14px", borderRadius: 8, borderLeft: "3px solid #8b5cf6" }}>
                     <strong>✨ AI Summary:</strong> {n.summary}
                     {n.suggested_disposition && (
                       <span style={{ marginLeft: 8, fontSize: 12, padding: "2px 8px", borderRadius: 999, background: "rgba(139,92,246,0.2)", color: "#c4b5fd" }}>
                         suggests: {n.suggested_disposition.replace(/_/g, " ")}
                       </span>
                     )}
                   </div>
                 )}
                 {n.transcript && (
                   <details style={{ marginTop: 8 }}>
                     <summary style={{ fontSize: 12, color: "var(--muted)", cursor: "pointer" }}>Transcript</summary>
                     <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 6, whiteSpace: "pre-wrap" }}>{n.transcript}</div>
                   </details>
                 )}
                 {!n.summary && n.ai_status !== "failed" && (
                   <div style={{ marginTop: 8, fontSize: 12, color: "var(--muted)" }}>✨ AI summary processing…</div>
                 )}
               </div>
             ))}

             {notes.length > 0 && logs.length > 0 && (
               <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, color: "var(--muted)", textTransform: "uppercase", marginTop: 4 }}>
                 📞 Calls
               </div>
             )}
             {logs.length === 0 && notes.length === 0 && <div className="empty">No calls or interactions logged yet.</div>}
             {logs.map(l => (
               <div key={l.id} style={{ padding: 16, background: "rgba(255,255,255,0.03)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.05)" }}>
                 <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8, display: "flex", justifyContent: "space-between" }}>
                   <span>🕒 {new Date(l.created_at).toLocaleString()}</span>
                   <span>⏱️ {l.duration_seconds} sec</span>
                 </div>
                 <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
                   <span className={`badge ${l.outcome || "unknown"}`}>{l.outcome || "No outcome"}</span>
                 </div>
                 {l.notes && <div style={{ marginTop: 8, fontSize: 14, color: "var(--text)", background: "rgba(16, 185, 129, 0.05)", padding: "10px 14px", borderRadius: 8, borderLeft: "3px solid var(--accent)" }}><strong>Telecaller Notes:</strong> {l.notes}</div>}
                 {l.summary && <div style={{ marginTop: 8, fontSize: 14, color: "var(--muted)", background: "rgba(0,0,0,0.2)", padding: "10px 14px", borderRadius: 8 }}><strong>AI Summary:</strong> {l.summary}</div>}
               </div>
             ))}
           </div>
         )}
       </div>
    </div>
  );
}
