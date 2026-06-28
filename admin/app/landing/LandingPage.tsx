"use client";

import { useEffect, useRef, useState } from "react";
import "./landing.css";
import {
  PhoneFrame,
  ScreenLeads,
  ScreenAlert,
  ScreenCall,
  ScreenPipeline,
  ScreenDashboard,
} from "./AppMockups";

const STORY = [
  {
    kick: "Capture",
    title: "Every lead lands in one place — automatically",
    body: "Facebook & Google ad leads, portal enquiries and walk-ins flow into Call Pro AI the moment they arrive. No copy-paste into Excel, nothing lost in a WhatsApp group.",
    tags: ["Facebook & Google", "Auto-capture", "CSV import"],
    Screen: ScreenLeads,
  },
  {
    kick: "Respond",
    title: "The right salesperson calls within 10 seconds",
    body: "A new lead is assigned and the caller is alerted instantly. Speed-to-lead is what wins the deal — and it happens on its own, even when you're not in the office.",
    tags: ["Instant assignment", "Hot-lead first", "Push alerts"],
    Screen: ScreenAlert,
  },
  {
    kick: "Call",
    title: "Auto-dial the whole list — every call recorded",
    body: "One tap dials leads back-to-back with no dead time. Every call is recorded and logged, so you can verify what was said and coach your team.",
    tags: ["Auto-dialer", "Call recording", "Full history"],
    Screen: ScreenCall,
  },
  {
    kick: "Follow up",
    title: "No lead goes cold — track every plot to booking",
    body: "Missed or busy calls schedule their own follow-up with reminders. Move each enquiry through site visit, token and booking — you always know what's live and what it's worth.",
    tags: ["Auto follow-ups", "Pipeline", "Value tracking"],
    Screen: ScreenPipeline,
  },
  {
    kick: "Control",
    title: "See your entire sales floor, live",
    body: "Calls made, leads worked, site visits and bookings — per caller, in real time. Run your team from your phone, without chasing anyone for an update.",
    tags: ["Live dashboard", "Per-caller stats", "Daily bookings"],
    Screen: ScreenDashboard,
  },
];

const STORY_SCREENS = [ScreenLeads, ScreenAlert, ScreenCall, ScreenPipeline, ScreenDashboard];

// Founder pain points → how Call Pro AI fixes each one. Short and sharp.
const PAINS = [
  { p: "Leads called hours too late", f: "Auto-assigned and dialled within seconds." },
  { p: "Leads scattered across WhatsApp & Excel", f: "Every lead in one organised place." },
  { p: "No idea who's working", f: "Each caller's calls and leads, live." },
  { p: "Hot buyers go cold", f: "Follow-ups auto-scheduled with reminders." },
  { p: "Callers leave with your data", f: "Leads and recordings stay with you." },
  { p: "No real view of the pipeline", f: "Live funnel from enquiry to booking." },
];

const FAQS = [
  {
    q: "Do my telecallers need training?",
    a: "No. It's simpler than WhatsApp — one screen, one tap to call. Most teams are calling within an hour of setup.",
  },
  {
    q: "Does it work with our existing phones and numbers?",
    a: "Yes. It runs on any Android phone using cloud calling — no special SIM, no hardware to buy.",
  },
  {
    q: "What happens to my data if a caller leaves?",
    a: "Everything — leads, phone numbers and call recordings — stays with you, the owner. Callers can't export or take your data with them.",
  },
  {
    q: "Where do the leads come from?",
    a: "Facebook & Google ad leads flow in automatically, and you can import your existing leads from a CSV in one click.",
  },
  {
    q: "Can I use it if I'm not in the office?",
    a: "That's exactly the point. The owner dashboard shows calls, leads and bookings live from your phone, wherever you are.",
  },
  {
    q: "How soon can we start?",
    a: "Same day. Add your team, import your leads, and start calling. Book a demo and we'll set it up with you.",
  },
];

const FEATURES = [
  { type: "alert", title: "10-second hot-lead alerts", body: "New lead in? The right phone rings instantly. Win the buyer before the competition calls." },
  { type: "dialer", title: "AI auto-dialer", body: "Tap once, it calls your entire list back-to-back. No misdials, no time wasted between calls." },
  { type: "record", title: "Every call recorded", body: "Automatic recording and history on every number — for coaching, quality and disputes." },
  { type: "followup", title: "Smart follow-ups", body: "Missed, busy or no-answer? The next attempt is scheduled automatically. Nothing forgotten." },
  { type: "funnel", title: "Funnel to booking", body: "Enquiry → site visit → token → booked. Always know your live pipeline and its value." },
  { type: "dashboard", title: "Owner dashboard", body: "Calls, leads and bookings per caller, in real time. Full visibility, zero chasing." },
] as const;

// A small animated mini-UI banner for each feature card — a "live widget" that
// shows the feature in action, not just a flat icon.
function FeatureViz({ type }: { type: string }) {
  switch (type) {
    case "alert":
      return (
        <div className="cv cv-alert">
          <div className="cv-toast">
            <span className="cv-ping" />
            <span className="cv-toast-txt">New buyer enquired about your plot</span>
          </div>
          <span className="cv-count" />
        </div>
      );
    case "dialer":
      return (
        <div className="cv cv-dial">
          <span className="cv-beam" />
          {[
            { i: "RS", n: "Rahul Sharma", c: "Call 1", t: "hot" },
            { i: "PM", n: "Priya Mehta", c: "Call 2", t: "warm" },
            { i: "AV", n: "Anil Verma", c: "Call 3", t: "hot" },
          ].map((r) => (
            <div className="cv-row" key={r.c}>
              <span className={`av t-${r.t}`}>{r.i}</span>
              <span className="nm">{r.n}</span>
              <span className="cl">{r.c}</span>
            </div>
          ))}
        </div>
      );
    case "record":
      return (
        <div className="cv cv-rec">
          <span className="cv-recdot" />
          <div className="cv-bars">
            {Array.from({ length: 20 }).map((_, i) => (
              <i
                key={i}
                style={{
                  height: `${24 + Math.abs(Math.sin(i * 0.8)) * 64}%`,
                  animationDelay: `${(i % 9) * 0.07}s`,
                }}
              />
            ))}
          </div>
          <span className="cv-time">00:14</span>
        </div>
      );
    case "followup":
      return (
        <div className="cv cv-ai">
          <span className="cv-ai-badge">AI summary</span>
          <div className="cv-ai-lines">
            <i /><i /><i />
            <span className="cv-ai-cursor" />
          </div>
        </div>
      );
    case "funnel":
      return (
        <div className="cv cv-funnel">
          {[
            { l: "Contacted", n: "86", w: 100, t: "warm" },
            { l: "Site visit", n: "41", w: 62, t: "hot" },
            { l: "Booking", n: "9", w: 28, t: "ok" },
          ].map((s) => (
            <div className="cv-fn" key={s.l}>
              <span className="cv-fn-l">{s.l}</span>
              <span className="cv-fn-track">
                <b className={`t-${s.t}`} style={{ width: `${s.w}%` }} />
              </span>
              <span className="cv-fn-n">{s.n}</span>
            </div>
          ))}
        </div>
      );
    case "dashboard":
      return (
        <div className="cv cv-stats">
          <div className="cv-stat cv-stat-1">
            <b>18</b>
            <span>Token paid</span>
          </div>
          <div className="cv-stat cv-stat-2">
            <b>9</b>
            <span>Bookings</span>
          </div>
          <span className="cv-live" />
        </div>
      );
    default:
      return null;
  }
}

// Comparison: y = has it, p = partial/limited, n = doesn't. Ordered so Call Pro
// AI is the only column that's all-green.
const COMPARE = [
  { f: "Built for real estate (site visit → token → booking)", us: "y", tele: "n", sell: "y", cally: "n" },
  { f: "Cloud calling — no SIM hassle", us: "y", tele: "y", sell: "p", cally: "n" },
  { f: "AI auto-dialer", us: "y", tele: "y", sell: "p", cally: "n" },
  { f: "10-second hot-lead alerts", us: "y", tele: "p", sell: "p", cally: "n" },
  { f: "AI call summary & next step", us: "y", tele: "n", sell: "n", cally: "n" },
  { f: "Automatic follow-ups", us: "y", tele: "y", sell: "y", cally: "n" },
  { f: "Live funnel to booking", us: "y", tele: "n", sell: "y", cally: "n" },
  { f: "Runs itself — no data entry", us: "y", tele: "n", sell: "n", cally: "n" },
  { f: "Live in a day, not a quarter", us: "y", tele: "y", sell: "n", cally: "y" },
  { f: "Made for small builders", us: "y", tele: "y", sell: "n", cally: "y" },
];

function Mark({ v }: { v: string }) {
  if (v === "y") return <span className="cmp-yes" aria-label="Yes">✓</span>;
  if (v === "p") return <span className="cmp-part" aria-label="Limited">~</span>;
  return <span className="cmp-no" aria-label="No">✕</span>;
}

const METRICS = [
  { num: "10s", lbl: "to first call on a hot lead" },
  { num: "3×", lbl: "more calls per caller, daily" },
  { num: "100%", lbl: "of calls recorded & tracked" },
  { num: "0", lbl: "leads lost in spreadsheets" },
];

const WA = "https://wa.me/919582020136?text=I%20want%20a%20Call%20Pro%20AI%20demo";

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Which business-model step is centred → drives the sticky phone's screen.
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            const i = Number((e.target as HTMLElement).dataset.index);
            if (!Number.isNaN(i)) setActive(i);
          }
        });
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: 0 },
    );
    // Observe both the desktop step blocks and the mobile scroll-track markers.
    // Whichever set is visible (the other is display:none) drives `active`.
    const targets = rootRef.current?.querySelectorAll<HTMLElement>("[data-story-step]");
    targets?.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  // GSAP scroll reveals (skipped under reduced motion).
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let ctx: { revert: () => void } | undefined;
    let cancelled = false;
    (async () => {
      const gsapMod = await import("gsap");
      const stMod = await import("gsap/ScrollTrigger");
      if (cancelled) return;
      const gsap = gsapMod.gsap ?? gsapMod.default;
      const ScrollTrigger = stMod.ScrollTrigger ?? stMod.default;
      gsap.registerPlugin(ScrollTrigger);
      ctx = gsap.context(() => {
        // Calm, simple fade-in for page content — no movement/skew/bounce.
        // All the real "life & physics" lives on the phone (see CSS .cp-phone).
        gsap.utils.toArray<HTMLElement>(".cp-reveal").forEach((el) => {
          gsap.fromTo(
            el,
            { opacity: 0 },
            {
              opacity: 1,
              duration: 0.6,
              ease: "power1.out",
              scrollTrigger: { trigger: el, start: "top 90%" },
            },
          );
        });
      }, rootRef);
    })();
    return () => {
      cancelled = true;
      ctx?.revert();
    };
  }, []);

  // Bigger, more dramatic 3D swing as you move through the steps.
  const stickyTilt = `rotateY(${-22 + active * 10}deg) rotateX(${9 - active * 2.4}deg)`;

  return (
    <div className="cp" ref={rootRef}>
      <div className="cp-bg" />

      {/* NAV */}
      <nav className={`cp-nav ${scrolled ? "scrolled" : ""}`}>
        <div className="cp-nav-inner">
          <a className="cp-logo" href="#top">
            <span className="cp-logo-mark">◎</span>
            Call&nbsp;Pro&nbsp;AI
          </a>
          <div className="cp-nav-links">
            <a href="#why">Why us</a>
            <a href="#how">How it works</a>
            <a href="#features">Features</a>
            <a href="#faq">FAQ</a>
            <a className="cp-btn cp-btn-primary" href={WA} target="_blank" rel="noopener noreferrer">
              Book a demo
            </a>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <header className="cp-hero" id="top">
        <div className="cp-shell cp-hero-grid">
          <div>
            <span className="cp-eyebrow">AI calling CRM for real estate</span>
            <h1>
              Turn every lead into a <span className="cp-grad">booking.</span>
            </h1>
            <p className="cp-hero-sub">
              Call Pro AI auto-dials your leads, records every call, and rings the right
              salesperson the second a hot buyer arrives — so plots and flats sell faster.
            </p>
            <div className="cp-hero-cta">
              <a className="cp-btn cp-btn-primary" href={WA} target="_blank" rel="noopener noreferrer">
                Book a free demo →
              </a>
              <a className="cp-btn cp-btn-ghost" href="#how">
                See how it works
              </a>
            </div>
            <div className="cp-hero-trust">
              <span><b>Built for</b> Indian real-estate teams</span>
              <span><b>Android app</b> + web dashboard</span>
            </div>
          </div>

          <div className="cp-hero-visual">
            <div className="cp-stage3d">
              <PhoneFrame className="cp-hero-phone">
                <ScreenLeads />
              </PhoneFrame>
            </div>
            <div className="cp-float cp-float-a">
              <span className="ic" style={{ background: "rgba(240,71,106,0.12)" }}>🔥</span>
              <span>
                New hot lead<small>Facebook · ₹45L</small>
              </span>
            </div>
            <div className="cp-float cp-float-b">
              <span className="ic" style={{ background: "rgba(16,185,129,0.12)" }}>✅</span>
              <span>
                Booking confirmed<small>Plot · ₹2,00,000 token</small>
              </span>
            </div>
            <div className="cp-float cp-float-c">
              <span className="ic" style={{ background: "rgba(79,70,229,0.12)" }}>📞</span>
              <span>
                118 calls today<small>across your team</small>
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* TRUST STRIP */}
      <div className="cp-logos">
        <div className="cp-shell cp-logos-inner">
          <span className="lead">Made for builders selling</span>
          <span>Plots &amp; layouts</span>
          <span>Apartments</span>
          <span>Villas</span>
          <span>Channel-partner teams</span>
        </div>
      </div>

      {/* STORY — business model walkthrough */}
      <section className="cp-section cp-story" id="how">
        <div className="cp-shell">
          <div className="cp-section-head cp-reveal">
            <span className="cp-eyebrow">How it works</span>
            <h2>From a Facebook lead to a booking — without dropping a single call.</h2>
            <p>Scroll through exactly how Call Pro AI runs your sales floor.</p>
          </div>

          <div className="cp-story-grid">
            {/* sticky 3D phone (desktop) */}
            <div className="cp-story-visual">
              <div className="cp-story-phone-wrap">
                <div className="cp-phone" style={{ transform: stickyTilt }}>
                  <div className="cp-phone-notch" />
                  <div className="cp-screen">
                    {STORY_SCREENS.map((Screen, i) => (
                      <div className={`cp-story-screen ${i === active ? "active" : ""}`} key={i}>
                        <div className="cp-fit">
                          <Screen />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* steps (desktop) */}
            <div className="cp-story-steps">
              {STORY.map((s, i) => (
                <div
                  className={`cp-step-block ${i === active ? "active" : ""}`}
                  key={s.title}
                  data-story-step
                  data-index={i}
                >
                  <span className="cp-step-kick">{s.kick}</span>
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                  <div className="cp-step-tags">
                    {s.tags.map((t) => (
                      <span key={t}>{t}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* MOBILE: one pinned phone, screen + caption change as you scroll */}
          <div className="cp-story-mobile">
            <div className="cp-mstage">
              <div className="cp-mphone-wrap">
                <div
                  className="cp-phone cp-mphone"
                  style={{ transform: `rotateY(${-15 + active * 7.5}deg) rotateX(${6 - active * 1.6}deg)` }}
                >
                  <div className="cp-phone-notch" />
                  <div className="cp-screen">
                    {STORY_SCREENS.map((Screen, i) => (
                      <div className={`cp-story-screen ${i === active ? "active" : ""}`} key={i}>
                        <div className="cp-fit">
                          <Screen />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              {/* vertical progress rail + glowing dot that climbs with the step */}
              <div className="cp-mrail" aria-hidden />
              <span className="cp-mrail-dot" aria-hidden style={{ top: `${78 - active * 12}%` }} />
              {/* the step label climbs from bottom (Capture) up to top (Control) */}
              <div className="cp-mcap" style={{ top: `${78 - active * 12}%` }}>
                <span className="cp-step-kick">{STORY[active].kick}</span>
              </div>
            </div>
            {/* invisible scroll track — each marker swaps the pinned phone */}
            <div className="cp-mtrack">
              {STORY.map((s, i) => (
                <div className="cp-mstep" key={s.title} data-story-step data-index={i} />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="cp-section" id="features">
        <div className="cp-shell">
          <div className="cp-section-head cp-reveal">
            <span className="cp-eyebrow">The selling system</span>
            <h2>An effortless selling system — not another CRM to manage.</h2>
            <p>
              Generic dialers only make calls. Big-builder CRMs need a setup team. Call Pro AI
              runs the whole sale for a small real-estate team — capture, call, follow up and
              close — right out of the box.
            </p>
          </div>
          <div className="cp-sys-line cp-reveal">
            <span>Built only for real estate</span>
            <span>Runs itself — no data entry</span>
            <span>Live in a day, not a quarter</span>
          </div>
          <div className="cp-features-grid">
            {FEATURES.map((f) => (
              <div className="cp-card cp-reveal" key={f.title}>
                <div className="cp-card-visual"><FeatureViz type={f.type} /></div>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* COMPARISON — Call Pro AI vs the alternatives */}
      <section className="cp-section" id="compare">
        <div className="cp-shell">
          <div className="cp-section-head cp-reveal">
            <span className="cp-eyebrow">How we compare</span>
            <h2>The only one built to close plots.</h2>
            <p>
              Dialers just make calls. Enterprise CRMs are built for big developers with a setup
              team. Call Pro AI is the effortless selling system made for small real-estate teams.
            </p>
          </div>
          <div className="cp-cmp-wrap cp-reveal">
            <div className="cp-cmp">
              <div className="cp-cmp-head">
                <span className="cp-cmp-feat" />
                <span className="cp-cmp-col cp-cmp-us">Call&nbsp;Pro&nbsp;AI</span>
                <span className="cp-cmp-col">TeleCRM</span>
                <span className="cp-cmp-col">Sell.Do</span>
                <span className="cp-cmp-col">Callyzer</span>
              </div>
              {COMPARE.map((r) => (
                <div className="cp-cmp-row" key={r.f}>
                  <span className="cp-cmp-feat">{r.f}</span>
                  <span className="cp-cmp-col cp-cmp-us"><Mark v={r.us} /></span>
                  <span className="cp-cmp-col"><Mark v={r.tele} /></span>
                  <span className="cp-cmp-col"><Mark v={r.sell} /></span>
                  <span className="cp-cmp-col"><Mark v={r.cally} /></span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* RESULTS — bold dark band: the payoff, numbers, one quote */}
      <section className="cp-section" id="proof">
        <div className="cp-shell">
          <div className="cp-results cp-reveal">
            <div className="cp-results-bg" />
            <span className="cp-eyebrow">The payoff</span>
            <h2>
              An effortless system that <span className="cp-grad-l">closes more.</span>
            </h2>
            <p>
              One extra booking covers Call Pro AI for a long time — it costs a fraction of your
              monthly ad spend.
            </p>
            <div className="cp-results-stats">
              {METRICS.map((m) => (
                <div className="cp-rstat" key={m.lbl}>
                  <div className="num cp-grad-l">{m.num}</div>
                  <div className="lbl">{m.lbl}</div>
                </div>
              ))}
            </div>
            <blockquote className="cp-results-quote">
              &ldquo;Our callers used to lose half the day deciding who to ring. Now the app just
              calls — and I finally see every booking the moment it happens.&rdquo;
              <span className="who">— Sales head, plotting project · Hyderabad</span>
            </blockquote>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="cp-section" id="faq">
        <div className="cp-shell">
          <div className="cp-section-head cp-reveal">
            <span className="cp-eyebrow">Questions, answered</span>
            <h2>Everything a founder asks before saying yes.</h2>
          </div>
          <div className="cp-faq cp-reveal">
            {FAQS.map((f) => (
              <details key={f.q}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="cp-section" id="demo">
        <div className="cp-shell">
          <div className="cp-cta cp-reveal">
            <h2>Start closing more — effortlessly.</h2>
            <p>
              Book a 15-minute demo on your own leads. We&apos;ll set up your team and show the
              first calls going out — live, on WhatsApp.
            </p>
            <div className="cp-cta-row">
              <a className="cp-btn cp-btn-primary" href={WA} target="_blank" rel="noopener noreferrer">
                Book a demo on WhatsApp
              </a>
              <a className="cp-btn cp-btn-ghost" href="mailto:hello@callproai.in">
                Email us
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* PAIN → SOLUTION (for the founder) — final reinforcement above footer */}
      <section className="cp-section" id="why">
        <div className="cp-shell">
          <div className="cp-section-head cp-reveal">
            <span className="cp-eyebrow">Sound familiar?</span>
            <h2>You&apos;re not losing deals to bad ads. You&apos;re losing them after the lead comes in.</h2>
            <p>Small teams don&apos;t have a lead problem. They have a follow-up problem.</p>
          </div>
          <div className="cp-pains">
            {PAINS.map((x) => (
              <div className="cp-pain cp-reveal" key={x.p}>
                <h3 className="cp-pain-p">{x.p}</h3>
                <p className="cp-pain-f">{x.f}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="cp-footer">
        <div className="cp-shell">
          <div className="cp-footer-top">
            <div>
              <a className="cp-logo" href="#top">
                <span className="cp-logo-mark">◎</span>
                Call&nbsp;Pro&nbsp;AI
              </a>
              <p>The AI calling CRM that helps real-estate teams call every lead in seconds and close more bookings.</p>
            </div>
            <div className="cp-footer-cols">
              <div className="cp-footer-col">
                <h4>Product</h4>
                <a href="#how">How it works</a>
                <a href="#features">Features</a>
                <a href="#proof">Results</a>
              </div>
              <div className="cp-footer-col">
                <h4>Company</h4>
                <a href={WA} target="_blank" rel="noopener noreferrer">WhatsApp us</a>
                <a href="mailto:hello@callproai.in">Contact</a>
                <a href="/privacy">Privacy</a>
                <a href="/login">Sign in</a>
              </div>
            </div>
          </div>
          <div className="cp-footer-bottom">
            <span>© {new Date().getFullYear()} Call Pro AI. All rights reserved.</span>
            <span>callproai.in</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
