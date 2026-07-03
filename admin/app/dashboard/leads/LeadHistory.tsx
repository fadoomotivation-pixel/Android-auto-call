"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function LeadHistory({ contactId, onClose }: { contactId: string; onClose: () => void }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("call_logs")
        .select("id, outcome, duration_seconds, notes, summary, created_at, salesperson_id")
        .eq("contact_id", contactId)
        .order("created_at", { ascending: false });
      setLogs(data || []);
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
         {loading ? <div style={{ color: "var(--muted)", textAlign: "center", padding: 40 }}>Loading history...</div> : logs.length === 0 ? <div className="empty">No calls or interactions logged yet.</div> : (
           <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
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
