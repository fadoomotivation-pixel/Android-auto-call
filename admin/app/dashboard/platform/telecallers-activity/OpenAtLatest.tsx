"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Open a conversation where a conversation opens: at the newest message.
 *
 * The thread renders oldest-first, which is right — a chat reads downwards.
 * But the pane was left scrolled to the top, so opening a 115-message thread
 * put September 2025 on screen and nothing else. The founder's reading of that
 * was "aaj ke chat nahi dikh rahe" — today's messages are missing — and it was
 * a fair reading: the newest message was four screens below the fold with
 * nothing to suggest it was there.
 *
 * Nobody opens WhatsApp at the oldest message. This puts the pane at the
 * bottom on mount, and offers a way back down once you have scrolled up.
 *
 * It scrolls the nearest ANCESTOR that actually scrolls, rather than the
 * window: on a phone the two-pane layout collapses and the pane is not a
 * scroll container, and scrolling the window there would throw the page header
 * off screen instead.
 */
export function OpenAtLatest({ count }: { count: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scroller, setScroller] = useState<HTMLElement | null>(null);
  const [away, setAway] = useState(false);

  useEffect(() => {
    let el: HTMLElement | null = ref.current?.parentElement ?? null;
    while (el) {
      const oy = getComputedStyle(el).overflowY;
      if ((oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight + 4) {
        el.scrollTop = el.scrollHeight;
        setScroller(el);
        return;
      }
      el = el.parentElement;
    }
  }, [count]);

  useEffect(() => {
    if (!scroller) return;
    const onScroll = () => {
      const gap = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
      setAway(gap > 400);
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => scroller.removeEventListener("scroll", onScroll);
  }, [scroller]);

  return (
    <div ref={ref}>
      {away && (
        <button
          type="button"
          onClick={() => scroller?.scrollTo({ top: scroller.scrollHeight, behavior: "smooth" })}
          style={{
            position: "sticky", bottom: 12, left: "50%", transform: "translateX(-50%)",
            display: "block", padding: "7px 16px", borderRadius: 999, cursor: "pointer",
            border: "1px solid rgba(255,255,255,0.14)", background: "#202c33",
            color: "#e9edef", fontSize: 12.5, fontWeight: 600,
            boxShadow: "0 6px 20px -8px rgba(0,0,0,0.8)",
          }}
        >
          ↓ Latest message
        </button>
      )}
    </div>
  );
}
