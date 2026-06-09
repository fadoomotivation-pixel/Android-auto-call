"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface FeedItem {
  id: string;
  phone: string;
  outcome: string | null;
  salesperson_id: string;
  created_at: string;
}

export function LiveFeed({ names }: { names: Record<string, string> }) {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [live, setLive] = useState(false);
  const namesRef = useRef(names);
  namesRef.current = names;

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("calls-feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "call_logs" },
        (payload) => {
          const r = payload.new as FeedItem;
          setItems((cur) => [r, ...cur].slice(0, 25));
        },
      )
      .subscribe((status) => setLive(status === "SUBSCRIBED"));

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="card" style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div className="label">Live activity</div>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: live ? "var(--good)" : "var(--muted)" }}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: live ? "var(--good)" : "var(--muted)", boxShadow: live ? "0 0 0 4px rgba(56,193,114,.15)" : "none" }} />
          {live ? "Live" : "Connecting…"}
        </span>
      </div>
      {items.length === 0 ? (
        <div style={{ color: "var(--muted)", padding: "16px 0" }}>
          Waiting for calls… new calls from your team will appear here instantly.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((it) => (
            <div key={it.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
              <div>
                <div style={{ fontWeight: 600 }}>{it.phone}</div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>{namesRef.current[it.salesperson_id] || "—"}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                {it.outcome && <span className={`badge ${it.outcome}`}>{it.outcome}</span>}
                <div style={{ fontSize: 12, color: "var(--muted)" }}>{new Date(it.created_at).toLocaleTimeString()}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
