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

// Clean monochrome line icons (feather-style) — no emoji, B2B-professional.
function Icon({ name }: { name: string }) {
  const paths: Record<string, React.ReactNode> = {
    phone: <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z" />,
    cloud: <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10Z" />,
    sparkle: <><path d="M12 3l1.7 4.8L18.5 9.5 13.7 11 12 16l-1.7-5L5.5 9.5 10.3 7.8 12 3Z" /><path d="M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14Z" /></>,
    chart: <path d="M12 20V10M18 20V4M6 20v-5" />,
    shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />,
    megaphone: <><path d="M3 11v2a1 1 0 0 0 1 1h3l7 4V6L7 10H4a1 1 0 0 0-1 1Z" /><path d="M16 8a5 5 0 0 1 0 8" /></>,
    video: <><rect x="2" y="6" width="13" height="12" rx="2" /><path d="M22 8l-7 4 7 4V8Z" /></>,
    doc: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z" /><path d="M14 2v6h6M8 13h8M8 17h8" /></>,
    cap: <><path d="M22 10 12 5 2 10l10 5 10-5Z" /><path d="M6 12v5c0 1 2.7 2 6 2s6-1 6-2v-5" /></>,
    users: <><path d="M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9.5" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    inbox: <><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.45 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.9A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.1Z" /></>,
    chat: <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z" />,
    pin: <><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0Z" /><circle cx="12" cy="10" r="3" /></>,
    trophy: <><path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" /><path d="M8 5H5v1.5A3 3 0 0 0 8 9.5M16 5h3v1.5a3 3 0 0 1-3 3" /><path d="M12 13v4M8.5 21h7l-1-4h-5l-1 4Z" /></>,
    calendar: <><rect x="3" y="4.5" width="18" height="17" rx="2" /><path d="M16 2.5v4M8 2.5v4M3 10h18" /></>,
    crown: <path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5L3 8Z" />,
    check: <path d="M5 13l4 4L19 7" />,
  };
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {paths[name]}
    </svg>
  );
}

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
  { f: "Made for", us: "Real estate", tele: "Generic", sell: "Enterprise", cally: "Tracking" },
  { f: "Built for the property sale", us: "y", tele: "n", sell: "y", cally: "n" },
  { f: "Cloud calling, no SIM", us: "y", tele: "y", sell: "p", cally: "n" },
  { f: "AI auto-dialer", us: "y", tele: "y", sell: "p", cally: "n" },
  { f: "10-second lead alerts", us: "y", tele: "p", sell: "p", cally: "n" },
  { f: "AI call summary", us: "y", tele: "n", sell: "n", cally: "n" },
  { f: "Automatic follow-ups", us: "y", tele: "y", sell: "y", cally: "n" },
  { f: "Live funnel to booking", us: "y", tele: "n", sell: "y", cally: "n" },
  { f: "Runs itself, no data entry", us: "y", tele: "n", sell: "n", cally: "n" },
  { f: "Setup time", us: "Same day", tele: "Days", sell: "Weeks", cally: "Days" },
];

const COMP_COLS = [
  { key: "tele", name: "TeleCRM", mono: "T" },
  { key: "sell", name: "Sell.Do", mono: "S" },
  { key: "cally", name: "Callyzer", mono: "C" },
] as const;

function Mark({ v }: { v: string }) {
  if (v === "y") return <span className="cmp-yes" aria-label="Yes">✓</span>;
  if (v === "p") return <span className="cmp-part" aria-label="Limited">~</span>;
  if (v === "n") return <span className="cmp-no" aria-label="No">✕</span>;
  return <span className="cmp-txt">{v}</span>;
}

// "What's included" in the custom plan — the full done-for-you selling system.
const INCLUDED = [
  { ic: "phone", t: "AI Calling CRM", b: "Auto-dialer, smart follow-ups, call recordings" },
  { ic: "cloud", t: "Cloud Telephony", b: "No SIM hassle. 100% virtual & scalable" },
  { ic: "sparkle", t: "AI Voice Agent", b: "Never miss a lead. 24/7 AI calling assistant" },
  { ic: "chart", t: "Lead & Sales Dashboard", b: "Real-time insights. Track every opportunity" },
  { ic: "shield", t: "Owner Dashboard", b: "Full visibility. Zero manual updates" },
  { ic: "megaphone", t: "Lead Generation", b: "Facebook Ads, Google Ads & campaign setup" },
  { ic: "video", t: "AI Sales Videos", b: "Personalised videos that warm up your leads" },
  { ic: "doc", t: "Brochures & PDFs", b: "High-converting project brochures" },
  { ic: "cap", t: "Team Training & Support", b: "Onboarding, training & ongoing support" },
  { ic: "users", t: "Dedicated Success Manager", b: "Your growth partner, not just a support rep" },
];

// The end-to-end flow shown as "your complete sales engine".
const SALES_ENGINE = [
  { ic: "megaphone", l: "Lead Generation" },
  { ic: "inbox", l: "Lead Capture" },
  { ic: "phone", l: "AI Calling" },
  { ic: "chat", l: "Follow-ups" },
  { ic: "pin", l: "Site Visit" },
  { ic: "trophy", l: "Booking" },
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
            <a href="#how">How it works</a>
            <a href="#compare">Why us</a>
            <a href="#pricing">Pricing</a>
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
              Generic dialers only make calls. Enterprise CRMs need a setup team. Call Pro AI
              runs the whole sale for your team — capture, call, follow up and close — right out
              of the box.
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
            <span className="cp-eyebrow">Why Call Pro AI</span>
            <h2>
              See why Call Pro AI is <span className="cp-grad">built for real estate.</span>
            </h2>
            <p>Compare the features and see how we help you get more calls, more visits and more bookings.</p>
          </div>
          <div className="cp-cmp-wrap cp-reveal">
            <div className="cp-cmp">
              <div className="cp-cmp-head">
                <span className="cp-cmp-feat">Features</span>
                <span className="cp-cmp-col cp-cmp-us">
                  <b>Call&nbsp;Pro&nbsp;AI</b>
                  <em>★ Best for real estate</em>
                </span>
                {COMP_COLS.map((c) => (
                  <span className="cp-cmp-col" key={c.key}>
                    <span className="cp-cmp-logo">{c.mono}</span>
                    {c.name}
                  </span>
                ))}
              </div>
              {COMPARE.map((r) => (
                <div className="cp-cmp-row" key={r.f}>
                  <span className="cp-cmp-feat">{r.f}</span>
                  <span className="cp-cmp-col cp-cmp-us"><Mark v={r.us} /></span>
                  {COMP_COLS.map((c) => (
                    <span className="cp-cmp-col" key={c.key}><Mark v={r[c.key]} /></span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* PRICING — custom plan card + what's included + the sales engine flow */}
      <section className="cp-section" id="pricing">
        <div className="cp-shell">
          <div className="cp-plan cp-reveal">
            <div className="cp-plan-left">
              <span className="cp-plan-kick"><Icon name="crown" /> Custom investment plan</span>
              <h3>
                One plan.<br />
                <span className="cp-grad">100% built for you.</span>
              </h3>
              <span className="cp-plan-rule" />
              <p>
                No fixed package. We design a complete sales system around your business model,
                team size, lead volume and goals.
              </p>
              <div className="cp-plan-shield">
                <span className="ic"><Icon name="shield" /></span>
                <span><b>No hidden charges</b><br />No setup surprises</span>
              </div>
              <a className="cp-btn cp-btn-primary cp-plan-btn" href={WA} target="_blank" rel="noopener noreferrer">
                <Icon name="calendar" /> Book a Strategy Call
              </a>
              <div className="cp-plan-resp"><span className="dot" /> Average response within 10 minutes</div>
            </div>

            <div className="cp-plan-right">
              <div className="cp-plan-inc-h">What&apos;s included</div>
              <div className="cp-plan-list">
                {INCLUDED.map((it) => (
                  <div className="cp-inc" key={it.t}>
                    <span className="cp-inc-ic"><Icon name={it.ic} /></span>
                    <span className="cp-inc-txt">
                      <b>{it.t}</b>
                      <small>{it.b}</small>
                    </span>
                    <span className="cp-inc-chk"><Icon name="check" /></span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="cp-ef cp-reveal">
            <div className="cp-ef-title">Your complete sales engine</div>
            <div className="cp-ef-row">
              {SALES_ENGINE.map((s) => (
                <div className="cp-ef-step" key={s.l}>
                  <span className="cp-ef-ic"><Icon name={s.ic} /></span>
                  <span className="cp-ef-label">{s.l}</span>
                </div>
              ))}
            </div>
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
            <h2>Start closing more, starting today.</h2>
            <p>
              Book a 15-minute demo on your own leads. We&apos;ll set up your team and show the
              first calls going out — live, on WhatsApp.
            </p>
            <div className="cp-cta-row">
              <a className="cp-btn cp-btn-primary" href={WA} target="_blank" rel="noopener noreferrer">
                Book a demo on WhatsApp
              </a>
              <a className="cp-btn cp-btn-ghost" href="mailto:admin@callproai.in">
                Email us
              </a>
            </div>
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
                <a href="mailto:admin@callproai.in">Contact</a>
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
