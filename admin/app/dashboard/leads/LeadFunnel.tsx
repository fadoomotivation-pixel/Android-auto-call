import type { Stage } from "@/lib/dashboard/stage";

/**
 * The forward path only: open stages, then won.
 * Lost, do-not-call, and bad-number are real stages, but they are not steps
 * on the way to a booking — the caller shows those as a pill instead.
 */
export function forwardStages(stages: Stage[]): Stage[] {
  return stages
    .filter((s) => s.outcome === "open" || s.outcome === "won")
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order);
}

export function LeadFunnel({
  stages,
  current,
  failed,
  ready,
}: {
  stages: Stage[];
  current: string | null;
  failed: boolean;
  ready: boolean;
}) {
  if (failed) {
    return <div className="error">Could not load the funnel.{current ? ` This lead's stage is ${current}.` : ""}</div>;
  }
  if (!ready) {
    return <p className="subtitle" style={{ margin: 0 }}>Loading the funnel…</p>;
  }
  if (stages.length === 0) {
    return <div className="error">No stages are set up, so the funnel cannot be drawn.{current ? ` This lead's stage is ${current}.` : ""}</div>;
  }

  const path = forwardStages(stages);
  const known = current ? stages.find((s) => s.code === current) : undefined;
  const onPath = !!known && path.some((s) => s.code === known.code);
  const here = onPath && known ? known.sort_order : null;

  return (
    <div className="lead-funnel-wrap">
      {!current && <p className="warn-line">No stage is set on this lead.</p>}
      {current && !known && (
        <p className="warn-line">This stage is not in the list ({current}).</p>
      )}
      {known && !onPath && (
        <div className="lead-funnel-off">
          <span className="status-pill" style={{ color: known.color }}>{known.label}</span>
          <span className="lead-funnel-note">Not on the path to a booking.</span>
        </div>
      )}
      <ol className="lead-funnel">
        {path.map((s) => {
          const cls = here == null ? "" : s.sort_order < here ? "is-done" : s.code === current ? "is-now" : "";
          return (
            <li key={s.code} className={`lead-step ${cls}`} aria-current={s.code === current ? "step" : undefined}>
              <div className="lead-step-track" />
              <div className="lead-step-name">{s.label}</div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
