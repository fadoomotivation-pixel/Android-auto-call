/**
 * Action Center — the one page that answers "what needs me right now".
 *
 * Not "Today", which is what this was called for its first hour. The name was
 * wrong: the top row is routinely a site visit that has been waiting a month,
 * and a page promising today's work while showing a thirty-day-old problem
 * teaches people to distrust the heading. This is an operations inbox, and
 * items stay in it until somebody deals with them.
 *
 * Every other dashboard here answers "how are we doing". There are twenty-three
 * of them and twenty-eight links in the sidebar, and between them they can tell
 * you the speed-to-lead, the funnel, the leaderboard, each rep's integrity
 * flags and what the AI thinks. What none of them can tell you is which four
 * things are on fire this morning — so operational work has no inbox, and a
 * site visit sat twenty-nine days without anybody being asked about it.
 *
 * THIS PAGE OWNS NO DATA. That is the design rule, and it is what stops it
 * becoming the twenty-fourth analytics screen. Every row is a link into the
 * page that already owns the subject: a lead opens Leads, a rep's CRM gaps open
 * Integrity, a recording opens Recordings. Nothing here is a second
 * implementation of anything, and when one of those pages changes its mind
 * about what a number means, this page changes with it.
 *
 * Deliberately absent, because they already exist and remain the source of
 * truth: telecaller performance (salespeople, velocity, xray), the leaderboard
 * (Overview), AI coaching (coach, rag), and the integrity analysis itself.
 *
 * Company scope: every query below reads a view or table whose RLS already does
 * the scoping — a company admin sees their own company, the platform super
 * admin sees all of them. `?company=` narrows the super admin to one tenant
 * without ever pinning them to their own, which is the rule that keeps the
 * "ankit" company from quietly becoming the whole platform.
 */
import type { ReactNode } from "react";
import Link from "next/link";
import { resolveScope } from "@/lib/dashboard/scope";
import { KpiChip } from "./KpiChip";
import { RemindRep, type ReminderKind } from "./RemindRep";

export const dynamic = "force-dynamic";

type Search = { company?: string };

function daysAgo(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

/** IST, always. A manager in Noida reading a UTC due-time will chase the wrong hour. */
function ist(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata", day: "numeric", month: "short",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
}

/**
 * How old is too old, as a colour.
 *
 * Thirteen rows all rendered in the same grey read as one undifferentiated
 * pile, and the twenty-nine-day-old visit looked exactly like this morning's.
 * The eye should land on the worst thing on the page without reading a single
 * number.
 */
function severity(days: number): { dot: string; color: string } {
  if (days >= 21) return { dot: "🔴", color: "#f87171" };
  if (days >= 14) return { dot: "🟠", color: "#fb923c" };
  if (days >= 7) return { dot: "🟡", color: "#facc15" };
  if (days >= 1) return { dot: "🔵", color: "#60a5fa" };
  return { dot: "🟢", color: "#4ade80" };
}

function Block({
  emoji, title, count, blurb, children, tone = "var(--accent)", id, clear,
}: {
  emoji: string; title: string; count: number; blurb: string;
  children: ReactNode; tone?: string; id?: string; clear?: string;
}) {
  // An empty queue is good news and should read like it — one confident line,
  // not a full-height card of grey space implying something is missing. Five
  // sections at full height with nothing in them is a page that looks broken.
  if (count === 0) {
    return (
      <section id={id} className="card"
        style={{ padding: "11px 16px", marginBottom: 10, scrollMarginTop: 16, opacity: 0.72 }}>
        <span style={{ fontSize: 13.5 }}>
          ✅ {clear ?? `No ${title.toLowerCase()} today`}
        </span>
      </section>
    );
  }
  return (
    <section id={id} className="card" style={{ padding: 16, marginBottom: 16, scrollMarginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>{emoji} {title}</h3>
        <span style={{
          fontSize: 13, fontWeight: 700, color: tone,
          background: `color-mix(in srgb, ${tone} 15%, transparent)`,
          borderRadius: 999, padding: "1px 9px",
        }}>{count}</span>
      </div>
      <p className="subtitle" style={{ margin: "4px 0 12px", fontSize: 12.5 }}>{blurb}</p>
      {children}
    </section>
  );
}

/** A heading inside a block — used to group overdue follow-ups by how late. */
function GroupHead({ label, n, color }: { label: string; n: number; color: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 7, marginTop: 12, marginBottom: 2,
      fontSize: 12, fontWeight: 700, color,
    }}>
      {label} <span style={{ opacity: 0.7, fontWeight: 600 }}>({n})</span>
    </div>
  );
}

function Row({ left, why, right, href, action }: {
  left: ReactNode; why: string; right: ReactNode; href: string; action?: ReactNode;
}) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
      padding: "9px 0", borderTop: "1px solid rgba(255,255,255,0.06)", fontSize: 13.5,
    }}>
      {/* The action sits OUTSIDE the link. A button inside an anchor is a row
          you cannot press without also navigating away from it. */}
      <Link href={href} style={{ textDecoration: "none", color: "inherit", flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {left}
        </span>
        {/* Why this row is in the queue at all. Without it the manager has to
            open the lead just to find out what the app is worried about, which
            is the navigation this page exists to remove. */}
        <span style={{ display: "block", fontSize: 11.5, color: "var(--muted)", marginTop: 1 }}>
          {why}
        </span>
      </Link>
      <span style={{ color: "var(--muted)", fontSize: 12.5, whiteSpace: "nowrap" }}>{right}</span>
      {action}
      <Link href={href} style={{ textDecoration: "none", color: "var(--muted)", fontSize: 12.5 }}>→</Link>
    </div>
  );
}

export default async function TodayPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  // Identity, admin gate and company scope in one call. The rule that a super
  // admin defaults to ALL companies and is never pinned to their own lives in
  // lib/dashboard/scope.ts, once, instead of being retyped on every page.
  const { supabase, isSuper, companyId: scope } = await resolveScope(sp);
  const todayEndIst = `${new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10)}T23:59:59+05:30`;

  // Built one at a time rather than through a generic helper: PostgREST
  // builders are mutable, so an `if` reads plainly and does not need a cast
  // that the Vercel build would have to be talked out of.
  const visitQ = supabase.from("v_pending_site_visit_outcomes")
    .select("contact_id, salesperson_id, name, phone, telecaller, visit_at, days_waiting, times_asked, needs_manager")
    .order("days_waiting", { ascending: false }).limit(40);
  if (scope) visitQ.eq("company_id", scope);

  const fupQ = supabase.from("follow_ups")
    .select("id, contact_id, name, phone, due_at, note, salesperson_id")
    .eq("status", "pending").lte("due_at", todayEndIst)
    .order("due_at", { ascending: true }).limit(40);
  if (scope) fupQ.eq("company_id", scope);

  const alertQ = supabase.from("founder_alerts")
    .select("id, contact_id, kind, detail, sent_at")
    .neq("detail", "(baseline — not sent)")
    .order("sent_at", { ascending: false }).limit(15);
  if (scope) alertQ.eq("company_id", scope);

  // Who has already been poked — read from the lead's own timeline, the same
  // log that carries its calls, notes and status changes. Once for the whole
  // page rather than per row, so twenty rows cost one query.
  const remQ = supabase.from("lead_activities")
    .select("contact_id, meta, created_at")
    .eq("type", "reminder")
    .order("created_at", { ascending: false }).limit(300);
  if (scope) remQ.eq("company_id", scope);

  const qualityQ = supabase.from("v_crm_data_quality")
    .select("salesperson_id, full_name, no_next_step, calls_no_outcome_7d, bookings_without_amount")
    .order("no_next_step", { ascending: false }).limit(20);
  if (scope) qualityQ.eq("company_id", scope);

  const [companyRows, pending, fups, alerts, quality, reminders] = await Promise.all([
    isSuper
      ? supabase.from("companies").select("id, name").order("name")
      : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    visitQ, fupQ, alertQ, qualityQ, remQ,
  ]);
  const companyList = (companyRows.data ?? []) as Array<{ id: string; name: string }>;

  const visits = (pending.data ?? []) as Array<{
    contact_id: string; salesperson_id: string | null; name: string | null; phone: string | null; telecaller: string | null;
    visit_at: string | null; days_waiting: number | null; times_asked: number; needs_manager: boolean;
  }>;
  const escalations = visits.filter((v) => v.needs_manager);
  const awaiting = visits.filter((v) => !v.needs_manager);

  const followUps = (fups.data ?? []) as Array<{
    id: string; contact_id: string | null; name: string | null; phone: string | null;
    due_at: string; note: string | null; salesperson_id: string | null;
  }>;
  const nowMs = Date.now();
  const overdue = followUps.filter((f) => new Date(f.due_at).getTime() < nowMs);
  const dueToday = followUps.filter((f) => new Date(f.due_at).getTime() >= nowMs);

  const fired = (alerts.data ?? []) as Array<{
    id: string; contact_id: string; kind: string; detail: string | null; sent_at: string;
  }>;
  const gaps = ((quality.data ?? []) as Array<{
    salesperson_id: string; full_name: string | null;
    no_next_step: number; calls_no_outcome_7d: number; bookings_without_amount: number;
  }>).filter((g) => g.no_next_step + g.calls_no_outcome_7d + g.bookings_without_amount > 0);

  // contact + kind → when it was last chased, keyed off meta.kind. The display
  // sentence is never parsed: it is free to be reworded or translated, and this
  // lookup will not notice. The query is newest first, so the first row per key
  // is the one to keep.
  const lastReminded = new Map<string, string>();
  for (const r of (reminders.data ?? []) as Array<{
    contact_id: string | null; meta: { kind?: string } | null; created_at: string;
  }>) {
    const kind = r.meta?.kind;
    if (!r.contact_id || !kind) continue;
    const key = `${r.contact_id}:${kind}`;
    if (!lastReminded.has(key)) lastReminded.set(key, r.created_at);
  }
  const remindedAt = (contactId: string | null, kind: ReminderKind) =>
    (contactId ? lastReminded.get(`${contactId}:${kind}`) ?? null : null);

  const oldestVisit = awaiting.reduce((m, v) => Math.max(m, v.days_waiting ?? 0), 0);
  const crmTotal = gaps.reduce((t, g) =>
    t + g.no_next_step + g.calls_no_outcome_7d + g.bookings_without_amount, 0);

  // Overdue, grouped by how late. Twenty-five identical rows is a list; four
  // buckets is a decision about where to start.
  const bucketOf = (f: { due_at: string }) => {
    const d = Math.floor((nowMs - new Date(f.due_at).getTime()) / 86_400_000);
    if (d >= 30) return 0;
    if (d >= 14) return 1;
    if (d >= 7) return 2;
    return 3;
  };
  const BUCKETS = [
    { label: "🔴 Over 30 days", color: "#f87171" },
    { label: "🟠 Over 14 days", color: "#fb923c" },
    { label: "🟡 Over 7 days", color: "#facc15" },
    { label: "🔵 This week", color: "#60a5fa" },
  ];
  const grouped = BUCKETS.map((b, i) => ({ ...b, rows: overdue.filter((f) => bucketOf(f) === i) }));

  const alertLabel: Record<string, string> = {
    booking_confirmed: "🎉 Booking confirmed",
    sale_closed: "🏆 Payment received",
    site_visit_fixed: "📍 Site visit fixed",
    site_visit_done: "✅ Site visit completed",
  };
  const q = scope ? `?company=${scope}` : "";

  return (
    <>
      <h2>🗂 Action Center</h2>
      <p className="subtitle">
        <strong>Everything waiting on a decision, oldest first.</strong> Every other page
        answers &ldquo;how are we doing&rdquo;; this one answers &ldquo;what do I do
        next&rdquo;. Each row opens the page that owns it — nothing here is a second copy
        of your reports.
      </p>

      {/* Which tenant am I looking at?
          A super admin acting on the wrong company's leads is the worst thing
          that can happen on this page, and the old chips answered the question
          with a faint tint. The selected one is now unmistakable — filled,
          ticked, bold, and lifted off the row — because "am I in All companies
          or only Fanbe?" must never need a second look. */}
      {isSuper && companyList.length > 0 && (
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center", margin: "12px 0 18px" }}>
          <span style={{ fontSize: 11.5, color: "var(--muted)", marginRight: 2 }}>Showing:</span>
          {[{ id: null as string | null, name: "All companies" }, ...companyList].map((c) => {
            const on = scope === c.id;
            return (
              <Link
                key={c.id ?? "all"}
                href={c.id ? `/dashboard/actions?company=${c.id}` : "/dashboard/actions"}
                style={{
                  padding: on ? "6px 15px" : "5px 12px",
                  borderRadius: 999, fontSize: 12.5, textDecoration: "none",
                  fontWeight: on ? 800 : 500,
                  background: on ? "var(--accent)" : "transparent",
                  color: on ? "#fff" : "var(--muted)",
                  border: on ? "1px solid var(--accent)" : "1px solid rgba(255,255,255,0.13)",
                  boxShadow: on ? "0 2px 10px color-mix(in srgb, var(--accent) 45%, transparent)" : "none",
                }}
              >
                {on ? "✓ " : ""}{c.name}
              </Link>
            );
          })}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "0 0 20px" }}>
        <KpiChip n={awaiting.length} label="Awaiting site visits" target="visits" tone="#f59e0b"
          hint={oldestVisit > 0 ? `oldest ${oldestVisit} days` : undefined} />
        <KpiChip n={overdue.length} label="Overdue follow-ups" target="followups" tone="#60a5fa"
          hint={dueToday.length > 0 ? `+${dueToday.length} due later today` : undefined} />
        <KpiChip n={crmTotal} label="CRM issues" target="crm" tone="#c084fc"
          hint={gaps.length > 0 ? `across ${gaps.length} telecaller${gaps.length > 1 ? "s" : ""}` : undefined} />
        <KpiChip n={escalations.length} label="Critical escalations" target="escalations" tone="#f87171" />
      </div>

      {/* 1 — the only block that is about a PERSON not answering, rather than a
          lead going stale. Two asks and still nothing means the prompt engine
          has done all it can and a human has to step in. */}
      <Block id="escalations" emoji="🚨" title="Escalations" count={escalations.length} tone="#f87171"
        clear="No escalations today — nobody has ignored the app twice"
        blurb="Asked twice and still no answer. The app has stopped chasing these — they need you.">
        {escalations.map((v) => (
          <Row key={v.contact_id} href={`/dashboard/leads?q=${encodeURIComponent(v.phone ?? "")}`}
            left={<><strong>{v.name || v.phone}</strong>{v.telecaller ? ` · ${v.telecaller}` : " · unassigned"}</>}
            why={`Asked ${v.times_asked}× and still no answer · ${v.days_waiting ?? 0} days since the visit`}
            right={<span style={{ color: severity(v.days_waiting ?? 0).color, fontWeight: 700 }}>
              {severity(v.days_waiting ?? 0).dot} {v.days_waiting ?? daysAgo(v.visit_at)}d
            </span>}
            action={<RemindRep userId={v.salesperson_id} contactId={v.contact_id}
              companyId={scope} kind="escalation" lastRemindedAt={remindedAt(v.contact_id, "escalation")}
              title="Site visit — still waiting on you"
              message={`${v.name || v.phone}: what happened at the visit? It has been ${v.days_waiting ?? 0} days.`} />} />
        ))}
      </Block>

      {/* 2 — the most expensive blank in the database: a visit that happened and
          nobody said what came of it keeps counting as a qualified lead in every
          report and in the ad autopsy, forever. */}
      <Block id="visits" emoji="📍" title="Site visits awaiting outcome" count={awaiting.length} tone="#f59e0b"
        clear="Every site visit has an outcome recorded"
        blurb="The customer came (or didn't) and nobody has recorded what happened. Until they do, these still count as qualified everywhere.">
        {awaiting.map((v) => (
          <Row key={v.contact_id} href={`/dashboard/leads?q=${encodeURIComponent(v.phone ?? "")}`}
            left={<><strong>{v.name || v.phone}</strong>{v.telecaller ? ` · ${v.telecaller}` : " · unassigned"}</>}
            why={`${v.days_waiting ?? 0} days since the site visit, outcome still not recorded`}
            right={<span style={{ color: severity(v.days_waiting ?? 0).color, fontWeight: 700 }}>
              {severity(v.days_waiting ?? 0).dot} {v.days_waiting ?? 0}d
            </span>}
            action={<RemindRep userId={v.salesperson_id} contactId={v.contact_id}
              companyId={scope} kind="site_visit" lastRemindedAt={remindedAt(v.contact_id, "site_visit")}
              title="Did they come to the site?"
              message={`${v.name || v.phone} — please record what happened at the visit.`} />} />
        ))}
      </Block>

      {/* 3 — invisible on the web until now: no page in this app read follow_ups. */}
      <Block id="followups" emoji="📋" title="Follow-ups due" count={followUps.length} tone="#60a5fa"
        clear="No callbacks due today"
        blurb={`${overdue.length} overdue, ${dueToday.length} still to come today. Overdue first — the customer who has waited longest is the one to ring.`}>
        {grouped.filter((g) => g.rows.length > 0).map((g) => (
          <div key={g.label}>
            <GroupHead label={g.label} n={g.rows.length} color={g.color} />
            {g.rows.slice(0, 10).map((f) => (
              <Row key={f.id} href={`/dashboard/leads?q=${encodeURIComponent(f.phone ?? "")}`}
                left={<><strong>{f.name || f.phone}</strong>{f.note ? ` · ${f.note}` : ""}</>}
                why={`Callback was promised for ${ist(f.due_at)} and has not been made`}
                right={<span style={{ color: g.color, fontWeight: 700 }}>overdue</span>}
                action={<RemindRep userId={f.salesperson_id} contactId={f.contact_id}
                  companyId={scope} kind="follow_up" lastRemindedAt={remindedAt(f.contact_id, "follow_up")}
                  title="Callback is overdue"
                  message={`${f.name || f.phone} was due ${ist(f.due_at)}. Call them or book a new time.`} />} />
            ))}
            {g.rows.length > 10 && (
              <div style={{ fontSize: 12, color: "var(--muted)", padding: "7px 0 0" }}>
                +{g.rows.length - 10} more in this group
              </div>
            )}
          </div>
        ))}
        {dueToday.length > 0 && (
          <div>
            <GroupHead label="🟢 Still to come today" n={dueToday.length} color="#4ade80" />
            {dueToday.slice(0, 8).map((f) => (
              <Row key={f.id} href={`/dashboard/leads?q=${encodeURIComponent(f.phone ?? "")}`}
                left={<><strong>{f.name || f.phone}</strong>{f.note ? ` · ${f.note}` : ""}</>}
                why={`Callback promised for ${ist(f.due_at)} today`}
                right={<span style={{ color: "#4ade80" }}>today</span>} />
            ))}
          </div>
        )}
      </Block>

      {/* 4 — what actually went out to a founder's phone. The engine sends one
          message per lead per kind, ever; this is the record of it. */}
      <Block id="alerts" emoji="🔔" title="Alerts sent" count={fired.length} tone="#22c55e"
        clear="No alerts today — nothing has booked or been visited yet"
        blurb="Bookings, payments and site visits that were pushed to WhatsApp. Baseline rows from first setup are not shown.">
        {fired.map((a) => (
          <Row key={a.id} href={`/dashboard/leads?id=${a.contact_id}`}
            left={<strong>{alertLabel[a.kind] ?? a.kind}</strong>}
            why={(a.detail ?? "").split("\n").find((l) => l.includes("Customer:"))?.trim()
              ?? "Pushed to the founder's WhatsApp"}
            right={ist(a.sent_at)} />
        ))}
      </Block>

      {/* 5 — a COUNT and a link, never the analysis. Integrity owns that, and
          two pages disagreeing about a rep's numbers is worse than one page. */}
      <Block id="crm" emoji="⚠️" title="CRM issues" count={gaps.length} tone="#c084fc"
        clear="Nothing missing from the CRM"
        blurb="Information missing from the CRM, per telecaller. The analysis lives on Integrity — this is only the nudge to go and look.">
        {gaps.map((g) => (
          <Row key={g.salesperson_id} href={`/dashboard/integrity${q}`}
            left={<>
              <strong>{g.full_name || "Telecaller"}</strong>
              <span style={{ display: "block", marginTop: 3, fontSize: 12, lineHeight: 1.7 }}>
                {g.no_next_step > 0 && (
                  <span style={{ color: "#f87171", marginRight: 12 }}>🔴 {g.no_next_step} missing next call</span>
                )}
                {g.calls_no_outcome_7d > 0 && (
                  <span style={{ color: "#fb923c", marginRight: 12 }}>🟠 {g.calls_no_outcome_7d} missing outcome</span>
                )}
                {g.bookings_without_amount > 0 && (
                  <span style={{ color: "#facc15" }}>🟡 {g.bookings_without_amount} missing amount</span>
                )}
              </span>
            </>}
            why=""
            right="" />
        ))}
      </Block>
    </>
  );
}
