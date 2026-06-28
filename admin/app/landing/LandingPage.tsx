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
    kick: "Lead aata hai",
    title: "Every lead lands in the app — automatically",
    body: "Facebook ads, portals, walk-ins — every enquiry flows into Call Pro AI the moment it arrives. No copy-paste into Excel, nothing forgotten in a WhatsApp group.",
    tags: ["Facebook leads", "Auto-capture", "CSV import"],
    Screen: ScreenLeads,
  },
  {
    kick: "10 second me call",
    title: "The right salesperson's phone rings in seconds",
    body: "The instant a hot lead comes in, it's assigned and the caller is alerted to ring back immediately. Speed-to-lead is what wins the deal — and it happens on its own.",
    tags: ["Instant alerts", "Smart routing", "Hot-lead first"],
    Screen: ScreenAlert,
  },
  {
    kick: "Auto-dialer + recording",
    title: "One tap dials your whole list — every call recorded",
    body: "The auto-dialer rings leads back-to-back with no dead time. Every call is recorded and logged, so quality and coaching are never guesswork.",
    tags: ["Auto-dialer", "Call recording", "Call history"],
    Screen: ScreenCall,
  },
  {
    kick: "Follow-up + funnel",
    title: "No lead slips — track every plot to booking",
    body: "Missed or busy? The next follow-up is scheduled for you. Move each enquiry through site visit, token and booking — you always know what's live and what it's worth.",
    tags: ["Auto follow-ups", "Pipeline", "₹ value tracking"],
    Screen: ScreenPipeline,
  },
  {
    kick: "Owner control",
    title: "The owner sees everything, live",
    body: "Calls made, leads worked, site visits and bookings — per caller, in real time. The full picture of your sales team without asking anyone for a report.",
    tags: ["Live dashboard", "Per-caller stats", "Daily bookings"],
    Screen: ScreenDashboard,
  },
];

const STORY_SCREENS = [ScreenLeads, ScreenAlert, ScreenCall, ScreenPipeline, ScreenDashboard];

const FEATURES = [
  { icon: "⚡", title: "10-second hot-lead alerts", body: "New lead in? The right phone rings instantly. Win the buyer before the competition calls." },
  { icon: "📞", title: "AI auto-dialer", body: "Tap once, it calls your entire list back-to-back. No misdials, no time wasted between calls." },
  { icon: "🎙️", title: "Every call recorded", body: "Automatic recording and history on every number — for coaching, quality and disputes." },
  { icon: "🔁", title: "Smart follow-ups", body: "Missed, busy or no-answer? The next attempt is scheduled automatically. Nothing forgotten." },
  { icon: "📊", title: "Funnel to booking", body: "Enquiry → site visit → token → booked. Always know your live pipeline and its value." },
  { icon: "🛡️", title: "Owner dashboard", body: "Calls, leads and bookings per caller, in real time. Full visibility, zero chasing." },
];

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
        gsap.utils.toArray<HTMLElement>(".cp-reveal").forEach((el) => {
          gsap.to(el, {
            opacity: 1,
            y: 0,
            duration: 0.85,
            ease: "power3.out",
            scrollTrigger: { trigger: el, start: "top 88%" },
          });
        });
      }, rootRef);
    })();
    return () => {
      cancelled = true;
      ctx?.revert();
    };
  }, []);

  const stickyTilt = `rotateY(${-16 + active * 6}deg) rotateX(6deg)`;

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
            <a href="#features">Features</a>
            <a href="#proof">Results</a>
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
                        <Screen />
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
                  style={{ transform: `rotateY(${-10 + active * 5}deg) rotateX(4deg)` }}
                >
                  <div className="cp-phone-notch" />
                  <div className="cp-screen">
                    {STORY_SCREENS.map((Screen, i) => (
                      <div className={`cp-story-screen ${i === active ? "active" : ""}`} key={i}>
                        <Screen />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="cp-mcap">
                <span className="cp-step-kick">{STORY[active].kick}</span>
                <h3>{STORY[active].title}</h3>
                <div className="cp-mdots">
                  {STORY.map((_, i) => (
                    <span key={i} className={i === active ? "on" : ""} />
                  ))}
                </div>
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
            <span className="cp-eyebrow">What it does</span>
            <h2>A calling engine, not just a CRM.</h2>
            <p>Everything your team needs to call more leads and close more plots — in one app.</p>
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
              just calls — and I finally see every booking the moment it happens.&rdquo;
            </p>
            <div className="who">— Sales head, plotting project · Hyderabad</div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="cp-section" id="demo">
        <div className="cp-shell">
          <div className="cp-cta cp-reveal">
            <h2>See it run on your own leads.</h2>
            <p>
              Book a 15-minute demo. We&apos;ll set up your team and show the first calls going
              out — live, on WhatsApp.
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
