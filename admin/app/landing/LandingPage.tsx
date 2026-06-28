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
        // Grids reveal as a springy stagger — cards rise + settle one after another.
        gsap.utils.toArray<HTMLElement>("[data-stagger]").forEach((group) => {
          const items = group.querySelectorAll<HTMLElement>(":scope > .cp-reveal");
          gsap.fromTo(
            items,
            { opacity: 0, y: 48, scale: 0.96 },
            {
              opacity: 1,
              y: 0,
              scale: 1,
              duration: 0.8,
              ease: "back.out(1.4)",
              stagger: 0.09,
              scrollTrigger: { trigger: group, start: "top 80%" },
            },
          );
        });

        // Standalone reveals (section heads, quote, ROI, FAQ).
        gsap.utils.toArray<HTMLElement>(".cp-reveal").forEach((el) => {
          if (el.closest("[data-stagger]")) return;
          gsap.fromTo(
            el,
            { opacity: 0, y: 42 },
            {
              opacity: 1,
              y: 0,
              duration: 0.9,
              ease: "power3.out",
              scrollTrigger: { trigger: el, start: "top 86%" },
            },
          );
        });

        // Premium "physics": card groups skew slightly with scroll velocity, then
        // spring back — the subtle inertia that reads as expensive.
        const skewEls = gsap.utils.toArray<HTMLElement>("[data-skew]");
        if (skewEls.length) {
          const setters = skewEls.map((el) =>
            gsap.quickTo(el, "skewY", { duration: 0.5, ease: "power3" }),
          );
          ScrollTrigger.create({
            onUpdate: (self) => {
              const v = gsap.utils.clamp(-4, 4, self.getVelocity() / -560);
              setters.forEach((s) => s(v));
            },
          });
        }
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

      {/* PAIN → SOLUTION (for the founder) */}
      <section className="cp-section" id="why">
        <div className="cp-shell">
          <div className="cp-section-head cp-reveal">
            <span className="cp-eyebrow">Sound familiar?</span>
            <h2>You&apos;re not losing deals to bad ads. You&apos;re losing them after the lead comes in.</h2>
            <p>
              Most small real-estate teams don&apos;t have a lead problem — they have a
              follow-up problem. Here&apos;s what that looks like, and how Call Pro AI fixes it.
            </p>
          </div>
          <div className="cp-pains" data-stagger data-skew>
            {PAINS.map((x) => (
              <div className="cp-pain cp-reveal" key={x.p}>
                <h3 className="cp-pain-p">{x.p}</h3>
                <p className="cp-pain-f">
                  <span className="ck">✓</span>
                  <span>{x.f}</span>
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

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
                  style={{ transform: `rotateY(${-10 + active * 5}deg) rotateX(4deg)` }}
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
              <div className="cp-mcap">
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
            <span className="cp-eyebrow">What it does</span>
            <h2>A calling engine, not just a CRM.</h2>
            <p>Everything your team needs to call more leads and close more plots — in one app.</p>
          </div>
          <div className="cp-features-grid" data-stagger data-skew>
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

      {/* ROI */}
      <section className="cp-section" id="roi">
        <div className="cp-shell">
          <div className="cp-roi cp-reveal">
            <span className="cp-eyebrow">Why it pays for itself</span>
            <h2>One extra booking covers Call Pro AI for a long time.</h2>
            <p>
              It costs a fraction of what you already spend on ads each month. Close even one
              more deal — or stop wasting a single batch of leads — and it has more than paid
              for itself.
            </p>
            <div className="cp-roi-points">
              <span className="cp-roi-point"><span className="ck">✓</span> Less than your monthly ad spend</span>
              <span className="cp-roi-point"><span className="ck">✓</span> More calls, faster, every day</span>
              <span className="cp-roi-point"><span className="ck">✓</span> Zero leads wasted</span>
            </div>
          </div>
        </div>
      </section>

      {/* PROOF */}
      <section className="cp-section" id="proof">
        <div className="cp-shell">
          <div className="cp-metrics" data-stagger data-skew>
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
