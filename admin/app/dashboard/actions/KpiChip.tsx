"use client";

/**
 * A workload number that takes you to the rows behind it.
 *
 * These were plain `<a href="#visits">` anchors, which looked right and did
 * nothing: the dashboard scrolls inside a container, not the window, so the
 * browser's own anchor jump had nothing to move. scrollIntoView works on
 * whichever ancestor actually scrolls, which is the whole point.
 *
 * The href is kept so the card is still a real link — middle-click, keyboard
 * focus and "open in new tab" all keep working, and if JavaScript has not
 * loaded yet the anchor is at least honest about where it points.
 */

import type { ReactNode } from "react";

export function KpiChip({
  n, label, target, tone, hint,
}: {
  n: number;
  label: string;
  /** DOM id of the section this counts. */
  target: string;
  tone: string;
  hint?: ReactNode;
}) {
  const live = n > 0;
  return (
    <a
      href={`#${target}`}
      onClick={(e) => {
        const el = document.getElementById(target);
        if (!el) return;                     // let the anchor try instead
        e.preventDefault();
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }}
      style={{
        textDecoration: "none", flex: "1 1 150px", minWidth: 140, display: "block",
        background: live ? `color-mix(in srgb, ${tone} 12%, transparent)` : "rgba(255,255,255,0.04)",
        border: `1px solid ${live ? `color-mix(in srgb, ${tone} 38%, transparent)` : "rgba(255,255,255,0.08)"}`,
        borderRadius: 12, padding: "11px 14px", cursor: "pointer",
        transition: "background 140ms ease, border-color 140ms ease",
      }}
    >
      <div style={{ fontSize: 26, fontWeight: 800, color: live ? tone : "var(--muted)", lineHeight: 1.1 }}>
        {n}
      </div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{label}</div>
      {hint && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3, opacity: 0.85 }}>{hint}</div>}
    </a>
  );
}
