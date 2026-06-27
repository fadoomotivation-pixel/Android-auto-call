"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import "./landing.css";

// 3D hero is client-only and heavy → load it lazily, never on the server.
const Hero3D = dynamic(() => import("./Hero3D"), {
  ssr: false,
  loading: () => null,
});

const FEATURES = [
  {
    icon: "📞",
    title: "AI auto-dialer",
    body: "Tap once and it calls your entire lead list back-to-back. No misdials, no dead time between calls.",
  },
  {
    icon: "⚡",
    title: "10-second hot-lead alerts",
    body: "The moment a Facebook lead comes in, the right caller's phone rings. Speed-to-lead wins the deal.",
  },
  {
    icon: "🎙️",
    title: "Every call recorded",
    body: "Automatic recording and call history on every number — for coaching, disputes and quality.",
  },
  {
    icon: "🔁",
    title: "Smart follow-ups",
    body: "Missed, busy or no-answer? It auto-schedules the next attempt so no lead slips through.",
  },
  {
    icon: "📊",
    title: "Funnel to booking",
    body: "Track each plot from enquiry → interested → site visit → token → booked. Always know what's live.",
  },
  {
    icon: "🛡️",
    title: "Owner dashboard",
    body: "Calls made, leads worked, bookings closed — per caller, in real time. The full picture, no asking.",
  },
];

const STEPS = [
  { n: "01", t: "Capture", d: "Facebook & portal leads flow in automatically — or import a CSV in one click." },
  { n: "02", t: "Call", d: "The auto-dialer rings leads instantly and back-to-back. Hot leads jump the queue." },
  { n: "03", t: "Follow up", d: "Every outcome is logged; the next attempt is scheduled for you, with a reminder." },
  { n: "04", t: "Close", d: "Move leads down the funnel to site visit, token and booking — all tracked." },
];

const USES = [
  { e: "🏞️", t: "Plotting & layouts", d: "High-volume enquiry calling done fast." },
  { e: "🏢", t: "Apartments", d: "Qualify, schedule visits, follow up." },
  { e: "🏡", t: "Villas & farmhouses", d: "Long-cycle leads, never forgotten." },
  { e: "🤝", t: "Channel-partner teams", d: "One dashboard across every caller." },
];

const METRICS = [
  { num: "10s", lbl: "to first call on a hot lead" },
  { num: "3×", lbl: "more calls per caller, per day" },
  { num: "100%", lbl: "of calls recorded & tracked" },
  { num: "0", lbl: "leads lost in spreadsheets" },
];

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const [show3D, setShow3D] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Decide whether to mount the 3D scene: skip on small screens and when the
  // visitor prefers reduced motion (battery / accessibility / low-end devices).
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const small = window.matchMedia("(max-width: 768px)").matches;
    setShow3D(!reduce && !small);
  }, []);

  // Sticky-nav background on scroll.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // GSAP scroll-storytelling: hero line reveal + scroll-triggered section reveals.
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

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
        // Hero headline lines rise in, staggered.
        gsap.from(".cp-hero h1 .line > span", {
          yPercent: 110,
          duration: 1,
          ease: "power4.out",
          stagger: 0.12,
          delay: 0.15,
        });
        gsap.from(".cp-hero-sub, .cp-hero-cta, .cp-hero-trust, .cp-eyebrow", {
          opacity: 0,
          y: 22,
          duration: 0.9,
          ease: "power3.out",
          stagger: 0.1,
          delay: 0.5,
        });

        // Generic scroll reveals.
        gsap.utils.toArray<HTMLElement>(".cp-reveal").forEach((el) => {
          gsap.to(el, {
            opacity: 1,
            y: 0,
            duration: 0.9,
            ease: "power3.out",
            scrollTrigger: { trigger: el, start: "top 85%" },
          });
        });
      }, rootRef);
    })();

    return () => {
      cancelled = true;
      ctx?.revert();
    };
  }, []);

  return (
    <div className="cp" ref={rootRef}>
      <div className="cp-bg" />
      <div className="cp-grid" />

      {/* NAV */}
      <nav className={`cp-nav ${scrolled ? "scrolled" : ""}`}>
        <div className="cp-nav-inner">
          <a className="cp-logo" href="#top">
            <span className="cp-logo-mark">◎</span>
            Call&nbsp;Pro&nbsp;AI
          </a>
          <div className="cp-nav-links">
            <a href="#features">Features</a>
            <a href="#how">How it works</a>
            <a href="#uses">Use cases</a>
            <a href="#pricing">Pricing</a>
            <a className="cp-btn cp-btn-primary" href="#pricing">
              Book a demo
            </a>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <header className="cp-hero" id="top">
        {show3D && <Hero3D />}
        <div className="cp-shell cp-hero-inner">
          <span className="cp-eyebrow">
            <span className="dot" /> AI calling CRM for real estate
          </span>
          <h1>
            <span className="line">
              <span>Turn every lead</span>
            </span>
            <span className="line">
              <span className="cp-grad">into a booking.</span>
            </span>
          </h1>
          <p className="cp-hero-sub">
            Call Pro AI auto-dials your leads, records every call, and alerts the right
            salesperson the second a hot lead lands — so plots sell faster.
          </p>
          <div className="cp-hero-cta">
            <a className="cp-btn cp-btn-primary" href="#pricing">
              Book a free demo →
            </a>
            <a className="cp-btn cp-btn-ghost" href="#how">
              See how it works
            </a>
          </div>
          <div className="cp-hero-trust">
            <span>
              <b>Built for</b> Indian real-estate teams
            </span>
            <span>
              <b>Cloud telephony</b> · no SIM hassle
            </span>
            <span>
              <b>Android app</b> + web dashboard
            </span>
          </div>
        </div>
        <div className="cp-scrollcue">
          Scroll
          <span className="bar" />
        </div>
      </header>

      {/* MARQUEE */}
      <div className="cp-marquee">
        <div className="cp-marquee-track">
          <span>Auto-dialer</span>
          <span>Hot-lead alerts</span>
          <span>Call recording</span>
          <span>Smart follow-ups</span>
          <span>Funnel to booking</span>
          <span>Owner dashboard</span>
          <span>Auto-dialer</span>
          <span>Hot-lead alerts</span>
          <span>Call recording</span>
          <span>Smart follow-ups</span>
          <span>Funnel to booking</span>
          <span>Owner dashboard</span>
        </div>
      </div>

      {/* PROBLEM → SOLUTION */}
      <section className="cp-section" id="why">
        <div className="cp-shell">
          <div className="cp-section-head cp-reveal">
            <span className="cp-eyebrow">The problem</span>
            <h2>Leads don&apos;t die from bad ads. They die from slow calls.</h2>
            <p>
              You pay for every Facebook lead. Then it sits in a spreadsheet for hours —
              and by the time someone calls, the buyer has already picked up a competitor.
            </p>
          </div>
          <div className="cp-split cp-reveal">
            <div className="cp-split-card cp-split-bad">
              <h3>Without Call Pro AI</h3>
              <ul className="cp-list">
                <li>
                  <span className="cp-tick no">✕</span>
                  <span>Leads sit in WhatsApp groups and Excel for hours.</span>
                </li>
                <li>
                  <span className="cp-tick no">✕</span>
                  <span>No one knows who called whom, or what was said.</span>
                </li>
                <li>
                  <span className="cp-tick no">✕</span>
                  <span>Follow-ups forgotten. Hot buyers go cold.</span>
                </li>
                <li>
                  <span className="cp-tick no">✕</span>
                  <span>The owner has zero visibility into the team.</span>
                </li>
              </ul>
            </div>
            <div className="cp-split-card cp-split-good">
              <h3>With Call Pro AI</h3>
              <ul className="cp-list">
                <li>
                  <span className="cp-tick ok">✓</span>
                  <span>
                    <b>New lead rings a caller in 10 seconds</b> — automatically.
                  </span>
                </li>
                <li>
                  <span className="cp-tick ok">✓</span>
                  <span>Every call recorded, logged and attributed.</span>
                </li>
                <li>
                  <span className="cp-tick ok">✓</span>
                  <span>The next follow-up is scheduled for you.</span>
                </li>
                <li>
                  <span className="cp-tick ok">✓</span>
                  <span>The owner sees calls, leads and bookings live.</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="cp-section" id="features">
        <div className="cp-shell">
          <div className="cp-section-head cp-reveal">
            <span className="cp-eyebrow">What it does</span>
            <h2>A calling engine, not just a CRM.</h2>
            <p>Everything your sales team needs to call more leads and close more plots — in one app.</p>
          </div>
          <div className="cp-features-grid">
            {FEATURES.map((f) => (
              <div className="cp-card cp-reveal" key={f.title}>
                <div className="cp-card-ico">{f.icon}</div>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="cp-section" id="how">
        <div className="cp-shell">
          <div className="cp-section-head cp-reveal">
            <span className="cp-eyebrow">How it works</span>
            <h2>From enquiry to booking, in four moves.</h2>
            <p>No setup headaches. Leads come in, the dialer does the work, the funnel keeps score.</p>
          </div>
          <div className="cp-steps">
            {STEPS.map((s) => (
              <div className="cp-step cp-reveal" key={s.n}>
                <div className="cp-step-num">{s.n}</div>
                <h3>{s.t}</h3>
                <p>{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* USE CASES */}
      <section className="cp-section" id="uses">
        <div className="cp-shell">
          <div className="cp-section-head cp-reveal">
            <span className="cp-eyebrow">Who it&apos;s for</span>
            <h2>Built for the way you actually sell.</h2>
          </div>
          <div className="cp-uses">
            {USES.map((u) => (
              <div className="cp-use cp-reveal" key={u.t}>
                <div className="emoji">{u.e}</div>
                <h3>{u.t}</h3>
                <p>{u.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PROOF */}
      <section className="cp-section" id="proof">
        <div className="cp-shell">
          <div className="cp-metrics">
            {METRICS.map((m) => (
              <div className="cp-metric cp-reveal" key={m.lbl}>
                <div className="num cp-grad">{m.num}</div>
                <div className="lbl">{m.lbl}</div>
              </div>
            ))}
          </div>
          <div className="cp-quote cp-reveal">
            <p>
              &ldquo;Our callers used to lose half the day deciding who to ring. Now the app
              just calls — and the owner finally sees every booking as it happens.&rdquo;
            </p>
            <div className="who">— Sales head, plotting project · Hyderabad</div>
          </div>
        </div>
      </section>

      {/* PRICING / CTA */}
      <section className="cp-section" id="pricing">
        <div className="cp-shell">
          <div className="cp-cta cp-reveal">
            <h2>
              Stop losing leads to <span className="cp-grad">slow follow-ups.</span>
            </h2>
            <p>
              Get a live demo on your own leads. We&apos;ll set up your team and show you the
              first calls going out in minutes.
            </p>
            <div className="cp-cta-row">
              <a
                className="cp-btn cp-btn-primary"
                href="https://wa.me/919999999999?text=I%20want%20a%20Call%20Pro%20AI%20demo"
                target="_blank"
                rel="noopener noreferrer"
              >
                Book a demo on WhatsApp
              </a>
              <a className="cp-btn cp-btn-ghost" href="mailto:hello@callproai.in">
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
                <a href="#features">Features</a>
                <a href="#how">How it works</a>
                <a href="#uses">Use cases</a>
                <a href="#pricing">Pricing</a>
              </div>
              <div className="cp-footer-col">
                <h4>Company</h4>
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
