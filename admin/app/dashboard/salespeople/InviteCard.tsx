"use client";

import { useState } from "react";

export function InviteCard({ code }: { code: string | null }) {
  const [copied, setCopied] = useState(false);

  if (!code) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(code!);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <div className="label">Invite salespeople</div>
      <p className="subtitle" style={{ margin: "8px 0 12px" }}>
        Share this company code. In the Bulk Caller app, a salesperson signs up and enters it to join your company.
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <code
          style={{
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: "0.15em",
            padding: "8px 14px",
            borderRadius: 8,
            background: "var(--panel-2)",
            border: "1px solid var(--border)",
          }}
        >
          {code}
        </code>
        <button className="primary" style={{ width: "auto", padding: "10px 16px" }} onClick={copy}>
          {copied ? "Copied ✓" : "Copy code"}
        </button>
      </div>
    </div>
  );
}
