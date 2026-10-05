import type { CSSProperties } from "react";

/**
 * Honest placeholders for dashboard routes that are still loading.
 *
 * A skeleton is a claim that the numbers are not here yet. It must never be
 * readable as zero, as "all clear", or as an empty successful result.
 */
const hidden: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
};

export function RouteSkeleton({
  title,
  bare = false,
}: {
  title: string;
  /** The real heading is already on the page. Don't draw a second fake one. */
  bare?: boolean;
}) {
  return (
    <div role="status" aria-busy="true" aria-live="polite" style={{ position: "relative" }}>
      <span style={hidden}>Loading {title}. This is not an empty result.</span>
      {!bare && (
        <>
          <div className="skeleton" style={{ width: 240, height: 28, marginBottom: 12 }} />
          <div className="skeleton" style={{ width: "min(480px, 100%)", height: 16, marginBottom: 20 }} />
        </>
      )}
      <div className="cards">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card" style={{ height: 96 }}>
            <div className="skeleton" style={{ width: 88, height: 12, marginBottom: 14 }} />
            <div className="skeleton" style={{ width: 56, height: 28 }} />
          </div>
        ))}
      </div>
      <div className="skeleton" style={{ width: "100%", height: 220, borderRadius: 16, marginTop: 8 }} />
    </div>
  );
}
