"use client";

import { memo, useEffect, useRef, useState } from "react";
import { LeadRow } from "./LeadRow";
import type { LeadView } from "./leadView";
import { LEAD_ROW_HEIGHT, windowRange } from "./window";

const OVERSCAN = 8;

function LeadListInner({
  views,
  selected,
  onToggle,
  onOpen,
}: {
  views: LeadView[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const viewsLen = views.length;
  const firstId = views[0]?.id ?? "";
  const [range, setRange] = useState(() => windowRange(0, 640, viewsLen, LEAD_ROW_HEIGHT, OVERSCAN));

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const measure = () => {
      const next = windowRange(
        el.scrollTop,
        el.clientHeight,
        viewsLen,
        LEAD_ROW_HEIGHT,
        OVERSCAN,
      );
      setRange((prev) => (
        prev.start === next.start && prev.end === next.end && prev.padTop === next.padTop && prev.padBot === next.padBot
          ? prev
          : next
      ));
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    measure();
    el.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(onScroll);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("scroll", onScroll);
      ro.disconnect();
    };
  }, [viewsLen]);

  useEffect(() => {
    const el = ref.current;
    if (el && el.scrollTop !== 0) el.scrollTop = 0;
  }, [firstId]);

  const slice = views.slice(range.start, range.end);

  return (
    <div className="lead-scroll" ref={ref} role="list" aria-label="Leads">
      {range.padTop > 0 && <div aria-hidden="true" style={{ height: range.padTop }} />}
      {slice.map((view) => (
        <LeadRow
          key={view.id}
          view={view}
          selected={selected.has(view.id)}
          onToggle={onToggle}
          onOpen={onOpen}
        />
      ))}
      {range.padBot > 0 && <div aria-hidden="true" style={{ height: range.padBot }} />}
    </div>
  );
}

export const LeadList = memo(LeadListInner);
