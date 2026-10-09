/**
 * Demo account: Call Pro AI, shown on a made-up builder.
 *
 * The founder opens this in front of another builder's founder. In the first
 * two minutes that person must understand what the product does and believe
 * the ad money comes back. So the page is one story, top to bottom:
 *
 *   ₹1 lakh of Meta ads → 600 leads → 45 site visits → 5 bookings
 *   9 buyers who would have been lost, and why they were not
 *   what the telecallers do today, and what the AI tells them to say
 *
 * Every number on it is read from the demo company's own rows (migration
 * 0222), the same way a real company's would be. None is typed into this file.
 * The page says "Demo data" at the top and the shell says it again on every
 * screen opened from here.
 *
 * Super admin only. A company admin never reaches it, and the data itself is
 * invisible to them by RLS.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { resolveScope } from "@/lib/dashboard/scope";
import { ist, istClock, rupees } from "@/lib/dashboard/format";
import {
  DEMO_COMPANY_ID, DEMO_MIGRATION, DEMO_PHONE_LOGIN, embedDemoKnowledge, refreshDemo,
} from "@/lib/dashboard/demo";

export const dynamic = "force-dynamic";

type Lead = {
  id: string; name: string | null; stage: string | null; company_name: string | null;
  assigned_at: string | null; created_at: string; site_visit_at: string | null;
  site_visit_arrived_at: string | null; token_paid_at: string | null; salesperson_id: string | null;
  extra: { campaign?: string; demo_saved?: string } | null;
};
type Call = {
  contact_id: string | null; salesperson_id: string; outcome: string | null;
  started_at: string | null; duration_seconds: number | null; summary: string | null;
};
type Ad = { day_offset: number; campaign: string; spend: number; leads: number };

const istKey = (ms: number) => new Date(ms + 5.5 * 3600_000).toISOString().slice(0, 10);

const STAGE_ORDER: Array<[string, string]> = [
  ["new", "New"], ["contacted", "Contacted"], ["interested", "Interested"], ["site_visit", "Site visit"],
  ["negotiation", "Negotiation"], ["token_paid", "Token paid"], ["won", "Won"], ["lost", "Lost"],
  ["dnc", "Do not call"], ["invalid", "Bad number"],
];

export default async function DemoPage() {
  const scope = await resolveScope(undefined, { require: "admin" });
  if (!scope.isSuper) redirect("/dashboard");
  const { supabase } = scope;

  const refreshed = await refreshDemo(supabase);
  if (refreshed.state !== "ready") {
    return (
      <>
        <div className="empty" style={{ textAlign: "left" }}>
          {refreshed.state === "missing" ? (
            <>
              <strong style={{ color: "var(--text)" }}>The demo company is not installed yet.</strong>
              <br />Open Supabase → SQL editor, paste <code>{DEMO_MIGRATION}</code>, and run it once. Then open this page again.
            </>
          ) : (
            <>Could not open the demo: {refreshed.message}</>
          )}
        </div>
      </>
    );
  }

  const q = `?company=${DEMO_COMPANY_ID}`;
  const callPage = (from: number) => supabase.from("call_logs")
    .select("contact_id, salesperson_id, outcome, started_at, duration_seconds, summary")
    .eq("company_id", DEMO_COMPANY_ID).order("started_at", { ascending: true }).range(from, from + 999)
    .returns<Call[]>();

  const [leadsR, peopleR, fuR, adR, kR, briefR, qaR, brain] = await Promise.all([
    supabase.from("contacts")
      .select("id, name, stage, company_name, assigned_at, created_at, site_visit_at, site_visit_arrived_at, token_paid_at, salesperson_id, extra")
      .eq("company_id", DEMO_COMPANY_ID).range(0, 1999).returns<Lead[]>(),
    supabase.from("profiles").select("id, full_name").eq("company_id", DEMO_COMPANY_ID)
      .returns<Array<{ id: string; full_name: string | null }>>(),
    supabase.from("follow_ups").select("due_at, salesperson_id").eq("company_id", DEMO_COMPANY_ID)
      .eq("status", "pending").range(0, 1999).returns<Array<{ due_at: string; salesperson_id: string }>>(),
    supabase.from("demo_ad_spend").select("day_offset, campaign, spend, leads").eq("company_id", DEMO_COMPANY_ID)
      .returns<Ad[]>(),
    supabase.from("knowledge_chunks").select("title, content, source_kind").eq("company_id", DEMO_COMPANY_ID)
      .eq("source_kind", "faq").order("title").returns<Array<{ title: string | null; content: string }>>(),
    supabase.from("coach_briefs").select("salesperson_id, slot, content").eq("company_id", DEMO_COMPANY_ID)
      .eq("brief_date", refreshed.anchorDay).returns<Array<{ salesperson_id: string; slot: string; content: string }>>(),
    supabase.from("coach_qa").select("salesperson_id, question, answer, created_at").eq("company_id", DEMO_COMPANY_ID)
      .order("created_at", { ascending: false }).limit(3)
      .returns<Array<{ salesperson_id: string; question: string; answer: string | null; created_at: string }>>(),
    embedDemoKnowledge(supabase),
  ]);

  // Calls run past PostgREST's 1,000-row page, so read them page by page.
  const calls: Call[] = [];
  for (let from = 0; from < 10_000; from += 1000) {
    const { data, error } = await callPage(from);
    if (error) break;
    calls.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }

  const firstError = [leadsR, peopleR, fuR, adR].find((r) => r.error)?.error;
  if (firstError) {
    return (
      <>
        <div className="error">Could not read the demo company: {firstError.message}</div>
      </>
    );
  }

  const leads = leadsR.data ?? [];
  const names = new Map((peopleR.data ?? []).map((p) => [p.id, p.full_name ?? "—"]));
  const ads = adR.data ?? [];
  const now = Date.now();
  const today = istKey(now);

  // ── The money story ──
  const spend = ads.reduce((t, r) => t + Number(r.spend), 0);
  const leadCount = leads.length;
  const visitFixed = leads.filter((l) => l.site_visit_at).length;
  const visited = leads.filter((l) => l.site_visit_arrived_at).length;
  const booked = leads.filter((l) => l.token_paid_at).length;
  const talked = new Set(calls.filter((c) => c.outcome === "connected" && (c.duration_seconds ?? 0) >= 30)
    .map((c) => c.contact_id)).size;
  const days = ads.length ? new Set(ads.map((a) => a.day_offset)).size : 0;

  // ── Speed to lead: first call after the lead arrived ──
  const firstCall = new Map<string, number>();
  for (const c of calls) {
    if (!c.contact_id || !c.started_at) continue;
    const t = new Date(c.started_at).getTime();
    const prev = firstCall.get(c.contact_id);
    if (prev === undefined || t < prev) firstCall.set(c.contact_id, t);
  }
  const waits = leads.flatMap((l) => {
    const f = firstCall.get(l.id);
    const a = new Date(l.assigned_at ?? l.created_at).getTime();
    return f === undefined ? [] : [(f - a) / 60_000];
  }).sort((a, b) => a - b);
  const median = waits.length ? waits[Math.floor(waits.length / 2)] : null;
  const within5 = waits.length ? Math.round((waits.filter((w) => w <= 5).length / waits.length) * 100) : null;

  // ── Saved by Call Pro AI ──
  const saved = leads.filter((l) => l.extra?.demo_saved);
  const savedBooked = saved.filter((l) => l.token_paid_at).length;

  // ── Today ──
  const fu = fuR.data ?? [];
  const dueToday = fu.filter((f) => istKey(new Date(f.due_at).getTime()) === today).length;
  const overdue = fu.filter((f) => istKey(new Date(f.due_at).getTime()) < today).length;
  const upcoming = leads.filter((l) => l.site_visit_at && !l.site_visit_arrived_at && new Date(l.site_visit_at).getTime() > now - 3 * 3600_000)
    .sort((a, b) => new Date(a.site_visit_at!).getTime() - new Date(b.site_visit_at!).getTime());
  const callsToday = new Map<string, { calls: number; talks: number }>();
  for (const c of calls) {
    if (!c.started_at || istKey(new Date(c.started_at).getTime()) !== today) continue;
    const r = callsToday.get(c.salesperson_id) ?? { calls: 0, talks: 0 };
    r.calls += 1;
    if (c.outcome === "connected" && (c.duration_seconds ?? 0) >= 30) r.talks += 1;
    callsToday.set(c.salesperson_id, r);
  }

  // ── Funnel by stage ──
  const byStage = new Map<string, number>();
  for (const l of leads) byStage.set(l.stage ?? "new", (byStage.get(l.stage ?? "new") ?? 0) + 1);
  const maxStage = Math.max(1, ...Array.from(byStage.values()));

  // ── Campaigns ──
  const camps = Array.from(new Set(ads.map((a) => a.campaign))).map((name) => {
    const own = leads.filter((l) => l.extra?.campaign === name);
    const s = ads.filter((a) => a.campaign === name).reduce((t, r) => t + Number(r.spend), 0);
    return {
      name, spend: s, leads: own.length,
      visits: own.filter((l) => l.site_visit_arrived_at).length,
      bookings: own.filter((l) => l.token_paid_at).length,
    };
  }).sort((a, b) => b.spend - a.spend);

  // ── Recent real talks with an AI summary ──
  const leadName = new Map(leads.map((l) => [l.id, l]));
  const recent = calls.filter((c) => c.summary && (c.duration_seconds ?? 0) >= 120 && c.started_at)
    .sort((a, b) => new Date(b.started_at!).getTime() - new Date(a.started_at!).getTime()).slice(0, 5);

  const objections = (kR.data ?? []).map((k) => {
    const said = /Buyer says:\s*(.+)/.exec(k.content)?.[1]?.trim() ?? "";
    const reply = /Winning reply:\s*([\s\S]+?)(\nWhy it works:|$)/.exec(k.content)?.[1]?.trim() ?? k.content;
    const why = /Why it works:\s*([\s\S]+)$/.exec(k.content)?.[1]?.trim() ?? "";
    return { title: (k.title ?? "").replace(/^Objection:\s*/, ""), said, reply, why };
  });
  const morning = (briefR.data ?? []).filter((b) => b.slot === "morning");
  const fmtMin = (m: number | null) => m === null ? "—" : m < 1 ? "under 1 min" : `${Math.round(m)} min`;

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Sunrise Infra · last {days || 30} days</h2>
          <p className="subtitle">
            A builder selling plots and flats with Meta lead ads and three telecallers on Call Pro AI.
          </p>
        </div>
        <Link className="btn-ghost" href={`/dashboard${q}`}>Open the dashboard as this company →</Link>
      </div>

      {/* 1. Money → bookings */}
      <section className="card demo-story">
        <div className="label">What the ad money brought back</div>
        <div className="demo-flow">
          <Step k="Meta ad spend" v={rupees(spend)} sub={`${days || 30} days, ${camps.length} lead forms`} />
          <Step k="Leads" v={String(leadCount)} sub={leadCount ? `${rupees(spend / leadCount)} per lead` : ""} />
          <Step k="Real talks" v={String(talked)} sub="A call of 30 seconds or more" />
          <Step k="Site visits" v={String(visited)} sub={`${visitFixed - visited} more booked this week`} />
          <Step k="Bookings" v={String(booked)} sub="Token paid" strong />
          <Step k="Cost per booking" v={booked ? rupees(spend / booked) : "—"} sub="Ad spend ÷ bookings" strong />
        </div>
        <p className="demo-foot">
          {booked} bookings from {rupees(spend)} of ads. If one booking earns the builder more than{" "}
          {booked ? rupees(spend / booked) : "—"}, the ads paid for themselves.
        </p>
      </section>

      {/* 2. Saved */}
      <section className="card demo-saved">
        <div className="demo-saved-head">
          <div className="demo-big">{saved.length}</div>
          <div>
            <h3>hot leads would have been missed without Call Pro AI</h3>
            <p className="subtitle" style={{ margin: 0 }}>
              They did not pick up, a follow-up was late, or their WhatsApp went unanswered. Call Pro AI put each one
              back at the top of the telecaller&apos;s Call now list. All {saved.length} reached a site visit
              {savedBooked ? `, and ${savedBooked} booked` : ""}.
            </p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Buyer</th><th>Project</th><th>Now</th><th>What Call Pro AI did</th></tr></thead>
            <tbody>
              {saved.map((l) => (
                <tr key={l.id}>
                  <td style={{ color: "var(--text)", fontWeight: 500 }}>{l.name}</td>
                  <td>{l.company_name}</td>
                  <td>{stageLabel(l.stage)}</td>
                  <td>{l.extra?.demo_saved}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 3. Today */}
      <h3 className="section-h">Today for the team</h3>
      <div className="cards">
        <Stat k="First call after a lead arrives" v={fmtMin(median)} sub={within5 === null ? "" : `${within5}% called within 5 minutes`} />
        <Stat k="Follow-ups due today" v={String(dueToday)} sub="On each telecaller's Follow-up tab" />
        <Stat k="Overdue follow-ups" v={String(overdue)} sub="Shown first in Call now" tone={overdue ? "warn" : undefined} />
        <Stat k="Site visits coming up" v={String(upcoming.length)} sub="Confirmed the evening before" />
      </div>

      <div className="split-2">
        <div className="card">
          <div className="label">Site visits coming up</div>
          {upcoming.length === 0 ? <p className="subtitle">None booked.</p> : (
            <ul className="demo-list">
              {upcoming.map((l) => (
                <li key={l.id}>
                  <span>{ist(l.site_visit_at)}</span>
                  <span style={{ color: "var(--text)" }}>{l.name}</span>
                  <span>{l.company_name}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="card">
          <div className="label">Calls today</div>
          <ul className="demo-list">
            {Array.from(names.entries()).map(([id, n]) => {
              const r = callsToday.get(id) ?? { calls: 0, talks: 0 };
              return (
                <li key={id}>
                  <span style={{ color: "var(--text)" }}>{n}</span>
                  <span>{r.calls} calls</span>
                  <span>{r.talks} real talks</span>
                </li>
              );
            })}
          </ul>
          <p className="subtitle" style={{ marginTop: 10 }}>Calls so far today, up to late morning.</p>
        </div>
      </div>

      {/* 4. Funnel */}
      <h3 className="section-h">Where all {leadCount} leads are now</h3>
      <div className="card">
        <div className="bars-h" style={{ marginTop: 0 }}>
          {STAGE_ORDER.filter(([code]) => byStage.get(code)).map(([code, label]) => (
            <div key={code} className="bar-h-row">
              <div className="bar-h-label">{label}</div>
              <div className="bar-h-track">
                <div className="bar-h-fill" style={{ width: `${((byStage.get(code) ?? 0) / maxStage) * 100}%` }} />
              </div>
              <div className="bar-h-n">{byStage.get(code)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 5. AI coach */}
      <h3 className="section-h">What the AI coach tells the telecaller to say</h3>
      <p className="subtitle" style={{ marginTop: -6 }}>
        During a call the telecaller taps Objection and gets the reply that has worked for this builder.
        {brain.missing > 0 ? ` ${brain.missing} of these are still being taught to the AI; open this page again in a minute.` : ""}
      </p>
      <div className="demo-grid">
        {objections.map((o) => (
          <div key={o.title} className="card demo-objection">
            <div className="label">Buyer: {o.title}</div>
            {o.said && <p className="demo-said">{o.said}</p>}
            <p className="demo-reply">{o.reply}</p>
            {o.why && <p className="subtitle" style={{ margin: 0 }}>{o.why}</p>}
          </div>
        ))}
      </div>

      <div className="split-2" style={{ marginTop: 18 }}>
        <div className="card">
          <div className="label">This morning&apos;s coach note</div>
          {morning.length === 0 ? <p className="subtitle">No note yet today.</p> : morning.map((b) => (
            <div key={b.salesperson_id} className="demo-note">
              <div className="demo-note-who">{names.get(b.salesperson_id)}</div>
              <p>{b.content}</p>
            </div>
          ))}
        </div>
        <div className="card">
          <div className="label">Questions telecallers asked the coach</div>
          {(qaR.data ?? []).map((qa) => (
            <div key={qa.question} className="demo-note">
              <div className="demo-note-who">{names.get(qa.salesperson_id)} · {ist(qa.created_at)}</div>
              <p style={{ color: "var(--text)" }}>{qa.question}</p>
              <p>{qa.answer}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 6. Calls */}
      <h3 className="section-h">Calls, summed up by AI</h3>
      <div className="card">
        {recent.map((c, i) => {
          const l = c.contact_id ? leadName.get(c.contact_id) : undefined;
          return (
            <div key={i} className="demo-note">
              <div className="demo-note-who">
                {l?.name} · {l?.company_name} · {names.get(c.salesperson_id)} · {ist(c.started_at)} ·{" "}
                {Math.round((c.duration_seconds ?? 0) / 60)} min
              </div>
              <p>{c.summary}</p>
            </div>
          );
        })}
      </div>

      {/* 7. Ads */}
      <h3 className="section-h">Meta lead forms</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Campaign</th><th className="num">Spend</th><th className="num">Leads</th>
              <th className="num">Per lead</th><th className="num">Site visits</th><th className="num">Bookings</th>
              <th className="num">Per booking</th>
            </tr>
          </thead>
          <tbody>
            {camps.map((c) => (
              <tr key={c.name}>
                <td style={{ color: "var(--text)", fontWeight: 500 }}>{c.name}</td>
                <td className="num">{rupees(c.spend)}</td>
                <td className="num">{c.leads}</td>
                <td className="num">{c.leads ? rupees(c.spend / c.leads) : "—"}</td>
                <td className="num">{c.visits}</td>
                <td className="num">{c.bookings}</td>
                <td className="num">{c.bookings ? rupees(c.spend / c.bookings) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="subtitle" style={{ marginTop: 6 }}>
        Booked and visit events go back to Meta, so the ads learn to find more buyers like the ones who booked.
      </p>

      {/* 8. Where to go next */}
      <h3 className="section-h">Show it in the real screens</h3>
      <div className="demo-links">
        {[
          ["/dashboard", "Overview", "Money card and team calls"],
          ["/dashboard/actions", "Action Center", "What needs a person now"],
          ["/dashboard/pulse", "Daily Pulse", "What each telecaller did today"],
          ["/dashboard/velocity", "Sales Velocity", "How fast leads get called"],
          ["/dashboard/coach", "AI Coach", "Coaching for each telecaller"],
          ["/dashboard/rag", "RAG", "What the AI knows"],
          ["/dashboard/projects", "Buyer Projects", "The three projects"],
          ["/dashboard/salespeople", "Salespeople", "The team"],
        ].map(([href, label, hint]) => (
          <Link key={href} href={`${href}${q}`} className="card demo-link">
            <strong>{label} →</strong>
            <span>{hint}</span>
          </Link>
        ))}
      </div>

      <section className="card demo-phone">
        <div className="label">On the phone</div>
        <p>
          Sign in to the Call Pro AI app as <strong>{DEMO_PHONE_LOGIN}</strong> to show Neha&apos;s day: Call now,
          follow-ups, a lead page with the AI coach. The password is in the pull request that added this demo.
        </p>
        <p className="subtitle" style={{ margin: 0 }}>
          Demo phone numbers start with +91 555. They are not real, so a call from the demo will not connect.
          Sign out of the demo when you are done. Dates here move to today each time this page opens
          {refreshed.movedDays ? ` (moved forward ${refreshed.movedDays} day${refreshed.movedDays === 1 ? "" : "s"} just now)` : ""}.
          Last call shown at {istClock(calls.at(-1)?.started_at ?? null, "—")}.
        </p>
      </section>
    </>
  );
}

function stageLabel(code: string | null): string {
  return STAGE_ORDER.find(([c]) => c === code)?.[1] ?? code ?? "—";
}

function Step({ k, v, sub, strong }: { k: string; v: string; sub: string; strong?: boolean }) {
  return (
    <div className={`demo-step${strong ? " strong" : ""}`}>
      <div className="k">{k}</div>
      <div className="v">{v}</div>
      <div className="s">{sub}</div>
    </div>
  );
}

function Stat({ k, v, sub, tone }: { k: string; v: string; sub: string; tone?: "warn" }) {
  return (
    <div className="card stat">
      <div className="label">{k}</div>
      <div className="value" style={tone === "warn" ? { color: "var(--warn)" } : undefined}>{v}</div>
      {sub && <div className="subtitle" style={{ margin: "4px 0 0", fontSize: 12.5 }}>{sub}</div>}
    </div>
  );
}
