"use client";
import { useState } from "react";

export function CopyBox({ text, wa = false }: { text: string; wa?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <>
      <div className="st-card st-pad"><p className="st-p" style={{ whiteSpace: "pre-wrap" }}>{text}</p></div>
      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        <button type="button" className="st-btn st-btn-lg" style={{ border: 0, cursor: "pointer" }}
          onClick={() => navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }, () => undefined)}>
          {copied ? "Copied" : "Copy"}
        </button>
        {wa && <a className="st-btn st-btn-lg st-btn-ghost" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer">Open in WhatsApp</a>}
      </div>
    </>
  );
}

export function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label><span className="st-label">{label}</span>
      <input className="st-in" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} /></label>
  );
}

export function Pick<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <label><span className="st-label">{label}</span>
      <select className="st-in" value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select></label>
  );
}
