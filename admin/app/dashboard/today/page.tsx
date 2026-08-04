/**
 * Today — the one page that answers "what do I need to do right now".
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
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { KIND_PHRASE, RemindRep } from "./RemindRep";

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

function Block({
  emoji, title, count, blurb, children, tone = "var(--accent)", id,
}: {
  emoji: string; title: string; count: number; blurb: string;
  children: ReactNode; tone?: string; id?: string;
}) {
  return (
    <section id={id} className="card" style={{ padding: 16, marginBottom: 16, scrollMarginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>{emoji} {title}</h3>
        <span style={{
          fontSize: 13, fontWeight: 700, color: count > 0 ? tone : "var(--muted)",
          background: count > 0 ? `color-mix(in srgb, ${tone} 15%, transparent)` : "transparent",
          borderRadius: 999, padding: count > 0 ? "1px 9px" : 0,
        }}>{count}</span>
      </div>
      <p className="subtitle" style={{ margin: "4px 0 12px", fontSize: 12.5 }}>{blurb}</p>
      {count === 0
        ? <div style={{ fontSize: 13, color: "var(--muted)" }}>Nothing waiting. ✅</div>
        : children}
    </section>
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

/** The workload in four numbers, before a single row is read. */
function Kpi({ n, label, href, tone }: { n: number; label: string; href: string; tone: string }) {
  return (
    <a href={href} style={{
      textDecoration: "none", flex: "1 1 130px", minWidth: 120,
      background: n > 0 ? `color-mix(in srgb, ${tone} 12%, transparent)` : "rgba(255,255,255,0.04)",
      border: `1px solid ${n > 0 ? `color-mix(in srgb, ${tone} 35%, transparent)` : "rgba(255,255,255,0.08)"}`,
      borderRadius: 12, padding: "10px 14px", display: "block",
    }}>
      <div style={{ fontSize: 24, fontWeight: 800, color: n > 0 ? tone : "var(--muted)", lineHeight: 1.1 }}>{n}</div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{label}</div>
    </a>
  );
}

export default async function TodayPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: me }, { data: pa }] = await Promise.all([
    supabase.from("profiles").select("role, company_id").eq("id", user!.id)
      .maybeSingle<{ role: string; company_id: string | null }>(),
    supabase.from("platform_admins").select("user_id").eq("user_id", user!.id).maybeSingle(),
  ]);
  const isSuper = !!pa;
  // Everyone lands here after login, so a telecaller has to be sent onward
  // rather than shown a locked door. This is an action queue for whoever runs
  // the team; a rep's own work is in the app, not here.
  if (me?.role !== "admin" && !isSuper) redirect("/dashboard");

  // The super admin may narrow to one tenant, and defaults to ALL of them.
  // Never their own company_id — that is how a platform owner ends up looking
  // at one customer and believing it is the business.
  const scope = isSuper ? (sp.company ?? null) : (me?.company_id ?? null);
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
    .select("contact_id, detail, created_at")
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

  // contact + kind → when it was last chased. lead_activities has no typed
  // `kind`, so the queue is recovered from the phrase RemindRep wrote —
  // KIND_PHRASE is the single place that mapping lives, shared by both sides.
  // The query is already newest first, so the first row seen for a key wins.
  const lastReminded = new Map<string, string>();
  for (const r of (reminders.data ?? []) as Array<{ contact_id: string | null; detail: string | null; created_at: string }>) {
    if (!r.contact_id) continue;
    const kind = (Object.keys(KIND_PHRASE) as Array<keyof typeof KIND_PHRASE>)
      .find((k) => (r.detail ?? "").includes(KIND_PHRASE[k]));
    if (!kind) continue;
    const key = `${r.contact_id}:${kind}`;
    if (!lastReminded.has(key)) lastReminded.set(key, r.created_at);
  }
  const remindedAt = (contactId: string | null, kind: string) =>
    (contactId ? lastReminded.get(`${contactId}:${kind}`) ?? null : null);

  const alertLabel: Record<string, string> = {
    booking_confirmed: "🎉 Booking confirmed",
    sale_closed: "🏆 Payment received",
    site_visit_fixed: "📍 Site visit fixed",
    site_visit_done: "✅ Site visit completed",
  };
  const q = scope ? `?company=${scope}` : "";

  return (
    <>
      <h2>☀️ Today</h2>
      <p className="subtitle">
        <strong>Only what needs you now.</strong> Every other page answers &ldquo;how are we
        doing&rdquo;; this one answers &ldquo;what do I do next&rdquo;. Each row opens the page
        that owns it — nothing here is a second copy of your reports.
      </p>

      {isSuper && companyList.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "10px 0 18px" }}>
          <Link href="/dashboard/today" className="chip"
            style={{ padding: "4px 11px", borderRadius: 999, fontSize: 12.5, textDecoration: "none",
              background: !scope ? "var(--accent)" : "rgba(255,255,255,0.06)",
              color: !scope ? "#fff" : "var(--text)" }}>All companies</Link>
          {companyList.map((c) => (
            <Link key={c.id} href={`/dashboard/today?company=${c.id}`}
              style={{ padding: "4px 11px", borderRadius: 999, fontSize: 12.5, textDecoration: "none",
                background: scope === c.id ? "var(--accent)" : "rgba(255,255,255,0.06)",
                color: scope === c.id ? "#fff" : "var(--text)" }}>{c.name}</Link>
          ))}
        </div>
      )}

      {/* The workload in four numbers. A super admin opening this at 9am should
          know the size of the day before reading a single row; each chip jumps
          to the section it counts. */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "0 0 20px" }}>
        <Kpi n={awaiting.length} label="Awaiting site visits" href="#visits" tone="#f59e0b" />
        <Kpi n={overdue.length} label="Overdue follow-ups" href="#followups" tone="#60a5fa" />
        <Kpi n={gaps.reduce((t, g) => t + g.no_next_step + g.calls_no_outcome_7d + g.bookings_without_amount, 0)}
             label="CRM issues" href="#crm" tone="#c084fc" />
        <Kpi n={escalations.length} label="Critical escalations" href="#escalations" tone="#f87171" />
      </div>

      {/* 1 — the only block that is about a PERSON not answering, rather than a
          lead going stale. Two asks and still nothing means the prompt engine
          has done all it can and a human has to step in. */}
      <Block id="escalations" emoji="🚨" title="Escalations" count={escalations.length} tone="#f87171"
        blurb="Asked twice and still no answer. The app has stopped chasing these — they need you.">
        {escalations.map((v) => (
          <Row key={v.contact_id} href={`/dashboard/leads?q=${encodeURIComponent(v.phone ?? "")}`}
            left={<><strong>{v.name || v.phone}</strong>{v.telecaller ? ` · ${v.telecaller}` : " · unassigned"}</>}
            why={`Asked ${v.times_asked}× and still no answer · ${v.days_waiting ?? 0} days since the visit`}
            right={`${v.days_waiting ?? daysAgo(v.visit_at)}d`}
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
        blurb="The customer came (or didn't) and nobody has recorded what happened. Until they do, these still count as qualified everywhere.">
        {awaiting.map((v) => (
          <Row key={v.contact_id} href={`/dashboard/leads?q=${encodeURIComponent(v.phone ?? "")}`}
            left={<><strong>{v.name || v.phone}</strong>{v.telecaller ? ` · ${v.telecaller}` : " · unassigned"}</>}
            why={`${v.days_waiting ?? 0} days since the site visit, outcome still not recorded`}
            right={ist(v.visit_at)}
            action={<RemindRep userId={v.salesperson_id} contactId={v.contact_id}
              companyId={scope} kind="site_visit" lastRemindedAt={remindedAt(v.contact_id, "site_visit")}
              title="Did they come to the site?"
              message={`${v.name || v.phone} — please record what happened at the visit.`} />} />
        ))}
      </Block>

      {/* 3 — invisible on the web until now: no page in this app read follow_ups. */}
      <Block id="followups" emoji="📋" title="Follow-ups due" count={followUps.length} tone="#60a5fa"
        blurb={`${overdue.length} overdue, ${dueToday.length} still to come today. Overdue first — the customer who has waited longest is the one to ring.`}>
        {[...overdue, ...dueToday].slice(0, 20).map((f) => {
          const late = new Date(f.due_at).getTime() < nowMs;
          return (
            <Row key={f.id} href={`/dashboard/leads?q=${encodeURIComponent(f.phone ?? "")}`}
              left={<><strong>{f.name || f.phone}</strong>{f.note ? ` · ${f.note}` : ""}</>}
              why={late
                ? `Callback was promised for ${ist(f.due_at)} and has not been made`
                : `Callback promised for ${ist(f.due_at)} today`}
              right={<span style={{ color: late ? "#f87171" : undefined }}>{late ? "overdue" : "today"}</span>}
              action={late ? <RemindRep userId={f.salesperson_id} contactId={f.contact_id}
                companyId={scope} kind="follow_up" lastRemindedAt={remindedAt(f.contact_id, "follow_up")}
                title="Callback is overdue"
                message={`${f.name || f.phone} was due ${ist(f.due_at)}. Call them or book a new time.`} /> : undefined} />
          );
        })}
      </Block>

      {/* 4 — what actually went out to a founder's phone. The engine sends one
          message per lead per kind, ever; this is the record of it. */}
      <Block id="alerts" emoji="🔔" title="Alerts sent" count={fired.length} tone="#22c55e"
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
        blurb="Information missing from the CRM, per telecaller. The analysis lives on Integrity — this is only the nudge to go and look.">
        {gaps.map((g) => (
          <Row key={g.salesperson_id} href={`/dashboard/integrity${q}`}
            left={<strong>{g.full_name || "Telecaller"}</strong>}
            why={[
              g.no_next_step ? "leads with no next call booked" : null,
              g.calls_no_outcome_7d ? "calls with nothing written down" : null,
              g.bookings_without_amount ? "bookings with no amount" : null,
            ].filter(Boolean).join(", ")}
            right={[
              g.no_next_step ? `${g.no_next_step} no next call` : null,
              g.calls_no_outcome_7d ? `${g.calls_no_outcome_7d} no outcome` : null,
              g.bookings_without_amount ? `${g.bookings_without_amount} no amount` : null,
            ].filter(Boolean).join(" · ")} />
        ))}
      </Block>
    </>
  );
}
