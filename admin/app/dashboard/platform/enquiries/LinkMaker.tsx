"use client";
import { useState } from "react";

// Personal form link for a lead who already messaged on WhatsApp.
export default function LinkMaker() {
  const [n, setN] = useState(""), [w, setW] = useState(""), [s, setS] = useState(""), [ok, setOk] = useState(false);
  const p = new URLSearchParams();
  if (n.trim()) p.set("n", n.trim());
  if (w.replace(/[^\d+]/g, "")) p.set("w", w.replace(/[^\d+]/g, ""));
  if (s.trim()) p.set("src", s.trim());
  const url = "https://website.callproai.in/" + (p.toString() ? "?" + p : "");
  return (
    <details className="card" style={{ padding: 12, margin: "12px 0" }}>
      <summary><strong>Make a personal link</strong> for a WhatsApp lead</summary>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
        <input value={n} onChange={(e) => setN(e.target.value)} placeholder="Name" />
        <input value={w} onChange={(e) => setW(e.target.value)} placeholder="WhatsApp number" inputMode="tel" />
        <input value={s} onChange={(e) => setS(e.target.value)} placeholder="Ad name (optional)" />
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <input readOnly value={url} style={{ flex: 1 }} aria-label="Personal link" />
        <button type="button" className="btn" onClick={async () => { try { await navigator.clipboard.writeText(url); setOk(true); setTimeout(() => setOk(false), 1500); } catch {} }}>
          {ok ? "Copied" : "Copy"}
        </button>
      </div>
    </details>
  );
}
