/**
 * The strip at the bottom of every module: where this page's numbers came from,
 * and what to do with them next.
 *
 * Rendered from lib/dashboard/modules.ts rather than written per page, so the
 * graph cannot drift — a module that starts feeding another gains the link on
 * both screens from one edit, and a link can never point at a page that no
 * longer consumes it.
 *
 * It carries the company scope. A super admin looking at Manas property who
 * clicks through to the Pulse should still be looking at Manas property; losing
 * the filter mid-journey is how someone ends up reading the whole platform's
 * numbers believing they are one customer's.
 */
import Link from "next/link";
import { MODULES, fedBy, feeds, type ModuleId } from "@/lib/dashboard/modules";
import { withScope } from "@/lib/dashboard/scope";

export function ModuleLinks({
  current, scope,
}: {
  current: ModuleId;
  /** Pass the resolved scope so links keep the company filter. */
  scope: { query: string };
}) {
  const from = fedBy(current);
  const to = feeds(current);
  const me = MODULES[current];
  if (!from.length && !to.length) return null;

  return (
    <section style={{
      marginTop: 34, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.08)",
    }}>
      <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 12 }}>
        <strong style={{ color: "var(--fg, #fff)" }}>{me.icon} {me.label}</strong> owns one
        question: {me.owns}
      </div>

      <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))" }}>
        {from.length > 0 && <Group title="Reads from" items={from} scope={scope} arrow="←" />}
        {to.length > 0 && <Group title="Feeds into" items={to} scope={scope} arrow="→" />}
      </div>
    </section>
  );
}

function Group({
  title, items, scope, arrow,
}: {
  title: string;
  items: Array<{ id: string; href: string; label: string; icon: string; owns: string }>;
  scope: { query: string };
  arrow: string;
}) {
  return (
    <div>
      <div style={{
        fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em",
        color: "var(--muted)", marginBottom: 7,
      }}>{title}</div>
      {items.map((m) => (
        <Link key={m.id} href={withScope(m.href, scope)}
          style={{
            display: "block", textDecoration: "none", padding: "7px 0",
            borderTop: "1px solid rgba(255,255,255,0.05)",
          }}>
          <span style={{ fontSize: 13.5, fontWeight: 600 }}>
            {arrow} {m.icon} {m.label}
          </span>
          <span style={{ display: "block", fontSize: 12, color: "var(--muted)", marginTop: 1 }}>
            {m.owns}
          </span>
        </Link>
      ))}
    </div>
  );
}
