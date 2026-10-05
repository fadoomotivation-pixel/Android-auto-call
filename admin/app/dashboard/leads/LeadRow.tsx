"use client";

import { memo } from "react";
import type { LeadView } from "./leadView";

function LeadRowInner({
  view,
  selected,
  onToggle,
  onOpen,
}: {
  view: LeadView;
  selected: boolean;
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  return (
    <div
      className={selected ? "lead-item is-on" : "lead-item"}
      role="listitem"
      tabIndex={0}
      onClick={() => onOpen(view.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen(view.id);
      }}
    >
      <input
        type="checkbox"
        checked={selected}
        aria-label={`Select ${view.title}`}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        onChange={() => onToggle(view.id)}
      />
      <div className="lead-item-main">
        <div className="lead-item-title">
          <span className="lead-item-name">{view.title}</span>
          <span className="lead-pills">
            <span className="status-pill" style={{ color: view.stageColor }}>{view.stageLabel}</span>
            {view.tempLabel && (
              <span className="status-pill" style={{ color: view.tempColor ?? undefined }}>{view.tempLabel}</span>
            )}
            {view.cross && (
              <span className="status-pill" style={{ color: "var(--warn)" }} title="This phone number also exists under another company">
                Shared phone
              </span>
            )}
            {view.hasNotes && <span className="status-pill" style={{ color: "var(--muted)" }}>Notes</span>}
          </span>
        </div>
        <div className="lead-item-meta">
          {view.meta}
          {view.assignee ? ` · ${view.assignee}` : ""}
        </div>
      </div>
      <span className="lead-open">Open</span>
    </div>
  );
}

export const LeadRow = memo(LeadRowInner);
