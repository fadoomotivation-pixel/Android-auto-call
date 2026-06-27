"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

function Logo() {
  return (
    <div className="logo-container">
      <span className="logo-icon">📞</span>
      <span className="logo-text">Call Pro AI</span>
    </div>
  );
}

function Feature({ icon, title, body, index }: { icon: string; title: string; body: string; index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("feature-visible");
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -50px 0px" }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className="feature-card feature-hidden"
      style={{ transitionDelay: `${index * 100}ms` }}
    >
      <div className="feature-icon-wrapper">{icon}</div>
      <h3 className="feature-title">{title}</h3>
      <p className="feature-body">{body}</p>
    </div>
  );
}

function Step({ n, title, body, index }: { n: string; title: string; body: string; index: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("step-visible");
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -50px 0px" }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className="step-card step-hidden"
      style={{ transitionDelay: `${index * 150}ms` }}
    >
      <div className="step-number">{n}</div>
      <h3 className="step-title">{title}</h3>
      <p className="step-body">{body}</p>
    </div>
  );
}

export default function LandingClient() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      setScrollY(window.scrollY);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Calculate advanced 3D transforms based on scroll
  const maxScroll = typeof window !== 'undefined' ? window.innerHeight : 1000;
  const scrollProgress = Math.min(Math.max(scrollY / maxScroll, 0), 1); // 0 to 1

  // Hero Mockup Transforms
  const mockupRotateX = 15 - (scrollProgress * 15); // Starts at 15deg tilted, goes flat to 0
  const mockupRotateY = -25 - (scrollProgress * -25); // Starts at -25deg tilted, goes flat to 0
  const mockupScale = 0.85 + (scrollProgress * 0.25); // Starts at 0.85, grows to 1.1
  const mockupZ = -100 + (scrollProgress * 150); // Starts far, comes close
  
  // Fade out hero content on scroll
  const heroOpacity = 1 - (scrollProgress * 2); // Fades out twice as fast

  // Parallax Background Spheres
  const bg1Y = scrollY * 0.4;
  const bg2Y = scrollY * -0.2;

  return (
    <div ref={containerRef} className="landing-container">
      <style dangerouslySetInnerHTML={{ __html: `
        :root {
          --accent: #10B981;
          --accent-dark: #059669;
          --bg: #F8FAFC;
          --text-main: #0F172A;
          --text-muted: #64748B;
        }
        body {
          margin: 0;
          font-family: system-ui, -apple-system, sans-serif;
          background: var(--bg);
          color: var(--text-main);
          overflow-x: hidden;
        }
        .landing-container {
          position: relative;
          overflow: hidden;
        }

        @keyframes pulse-glow {
          0%, 100% { opacity: 0.8; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.05); }
        }
        @keyframes float-reverse {
          0%, 100% { transform: translateY(0) translateZ(100px); }
          50% { transform: translateY(20px) translateZ(120px); }
        }

        /* Nav */
        .nav-wrapper {
          position: fixed;
          top: 0; left: 0; right: 0;
          z-index: 50;
          background: rgba(248, 250, 252, 0.85);
          backdrop-filter: blur(12px);
          border-bottom: 1px solid rgba(0,0,0,0.05);
        }
        .nav-inner {
          max-width: 1200px;
          margin: 0 auto;
          padding: 16px 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .logo-container {
          display: flex;
          align-items: center;
          gap: 12px;
          font-weight: 800;
          letter-spacing: -0.02em;
        }
        .logo-icon {
          width: 38px; height: 38px; border-radius: 12px;
          display: grid; place-items: center;
          background: linear-gradient(135deg, var(--accent), var(--accent-dark));
          box-shadow: 0 8px 16px rgba(16, 185, 129, 0.3), inset 0 2px 4px rgba(255,255,255,0.3);
          font-size: 20px; color: white;
        }
        .logo-text { font-size: 20px; color: var(--text-main); }

        /* Buttons */
        .btn-primary {
          background: linear-gradient(135deg, var(--accent), var(--accent-dark));
          color: white; font-weight: 700; font-size: 15px; padding: 12px 24px; border-radius: 14px;
          text-decoration: none; border: none; cursor: pointer;
          box-shadow: 0 10px 20px rgba(16, 185, 129, 0.25), inset 0 2px 4px rgba(255,255,255,0.2);
          transition: transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1), box-shadow 0.3s;
        }
        .btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 15px 25px rgba(16, 185, 129, 0.35), inset 0 2px 4px rgba(255,255,255,0.2);
        }
        .btn-ghost {
          color: var(--text-main); font-weight: 600; font-size: 15px; padding: 12px 24px; border-radius: 14px;
          text-decoration: none; background: white; border: 1px solid rgba(0,0,0,0.08);
          box-shadow: 0 4px 12px rgba(0,0,0,0.03); transition: all 0.3s ease;
        }
        .btn-ghost:hover {
          background: #f1f5f9; transform: translateY(-2px); box-shadow: 0 8px 16px rgba(0,0,0,0.06);
        }

        /* Hero */
        .hero-section {
          position: relative;
          padding: 140px 24px 60px;
          max-width: 1200px; margin: 0 auto;
          display: flex; align-items: center; gap: 40px;
          z-index: 10;
          min-height: 90vh;
        }
        .hero-content { flex: 1; max-width: 600px; }
        .hero-badge {
          display: inline-block; font-size: 14px; font-weight: 700; color: var(--accent-dark);
          background: rgba(16, 185, 129, 0.1); padding: 8px 16px; border-radius: 50px; margin-bottom: 24px;
        }
        .hero-title {
          font-size: clamp(44px, 5vw, 68px); line-height: 1.1; font-weight: 800;
          letter-spacing: -0.03em; margin: 0 0 24px; color: var(--text-main);
        }
        .hero-title span { color: var(--accent); position: relative; display: inline-block; }
        .hero-title span::after {
          content: ''; position: absolute; bottom: 8px; left: 0; width: 100%; height: 12px;
          background: rgba(16, 185, 129, 0.2); z-index: -1; border-radius: 6px;
        }
        .hero-subtitle { font-size: clamp(18px, 2vw, 22px); color: var(--text-muted); line-height: 1.6; margin: 0 0 40px; }
        .hero-actions { display: flex; gap: 16px; flex-wrap: wrap; }

        /* 3D Scene */
        .hero-3d-scene {
          flex: 1; perspective: 1200px; position: relative; height: 600px;
          display: flex; align-items: center; justify-content: center;
          transform-style: preserve-3d;
        }
        .mockup-main {
          width: 320px; height: 640px; background: white; border-radius: 40px;
          border: 8px solid #E2E8F0; position: relative; overflow: hidden; display: flex; flex-direction: column;
          box-shadow: 30px 40px 80px rgba(0, 0, 0, 0.12), -10px -10px 30px rgba(255, 255, 255, 1), inset 0 0 0 2px #F1F5F9;
        }
        .mockup-header { background: var(--accent); height: 140px; padding: 28px 20px; color: white; }
        .mockup-body { background: #F8FAFC; flex: 1; padding: 20px; display: flex; flex-direction: column; gap: 16px; }
        .mockup-card { background: white; border-radius: 14px; padding: 16px; box-shadow: 0 6px 12px rgba(0,0,0,0.04); display: flex; align-items: center; gap: 14px; }
        .mockup-avatar { width: 48px; height: 48px; border-radius: 50%; background: #E2E8F0; }
        .mockup-text-1 { width: 120px; height: 14px; background: #E2E8F0; border-radius: 6px; margin-bottom: 8px; }
        .mockup-text-2 { width: 160px; height: 12px; background: #F1F5F9; border-radius: 6px; }

        .mockup-float-card {
          position: absolute; right: -60px; bottom: 140px; background: rgba(255,255,255,0.9);
          padding: 20px; border-radius: 20px; box-shadow: 20px 25px 50px rgba(0,0,0,0.15);
          display: flex; align-items: center; gap: 14px; border: 1px solid rgba(255,255,255,1);
          backdrop-filter: blur(12px); transform: translateZ(100px);
          animation: float-reverse 5s ease-in-out infinite;
        }
        .mockup-pulse { width: 14px; height: 14px; background: var(--accent); border-radius: 50%; box-shadow: 0 0 0 6px rgba(16,185,129,0.2); animation: pulse-glow 2s ease-in-out infinite; }

        /* Stat Strip */
        .stat-strip { max-width: 1200px; margin: -60px auto 100px; padding: 0 24px; position: relative; z-index: 20; }
        .stat-grid {
          display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px;
          background: white; border-radius: 24px; padding: 40px 32px;
          box-shadow: 0 30px 60px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.02);
        }
        .stat-item { text-align: center; }
        .stat-big { font-size: 36px; font-weight: 800; color: var(--accent); letter-spacing: -0.02em; margin-bottom: 8px; }
        .stat-small { font-size: 16px; color: var(--text-muted); font-weight: 500; }

        /* Features - Custom Native Scroll Reveal */
        .features-section { max-width: 1200px; margin: 120px auto; padding: 0 24px; }
        .section-header { text-align: center; margin-bottom: 80px; }
        .section-title { font-size: clamp(32px, 4vw, 48px); font-weight: 800; letter-spacing: -0.02em; margin: 0 0 20px; }
        .section-subtitle { color: var(--text-muted); font-size: 20px; max-width: 600px; margin: 0 auto; }
        .features-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 32px; }
        
        .feature-hidden { opacity: 0; transform: translateY(50px) rotateX(20deg); transition: opacity 0.6s ease-out, transform 0.6s ease-out, box-shadow 0.3s; }
        .feature-visible { opacity: 1; transform: translateY(0) rotateX(0deg); }
        
        .feature-card {
          background: white; border-radius: 28px; padding: 40px 32px;
          box-shadow: 0 12px 30px rgba(0,0,0,0.04); border: 1px solid rgba(0,0,0,0.02);
          transform-style: preserve-3d;
        }
        .feature-card:hover { transform: translateY(-10px) scale(1.02); box-shadow: 0 20px 40px rgba(16, 185, 129, 0.12); z-index: 2; transition: all 0.3s; }

        .feature-icon-wrapper {
          width: 64px; height: 64px; background: rgba(16, 185, 129, 0.1); border-radius: 20px;
          display: grid; place-items: center; font-size: 32px; margin-bottom: 24px;
        }
        .feature-title { font-size: 22px; font-weight: 700; margin: 0 0 16px; letter-spacing: -0.01em; }
        .feature-body { color: var(--text-muted); font-size: 16px; line-height: 1.6; margin: 0; }

        /* How it works */
        .how-section { background: white; padding: 120px 24px; position: relative; overflow: hidden; }
        .how-inner { max-width: 1200px; margin: 0 auto; }
        .steps-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 48px; position: relative; margin-top: 60px; }
        
        .step-hidden { opacity: 0; transform: translateX(-50px); transition: all 0.5s ease-out; }
        .step-visible { opacity: 1; transform: translateX(0); }
        
        .step-card { position: relative; z-index: 2; }
        .step-number {
          width: 60px; height: 60px; background: linear-gradient(135deg, var(--accent), var(--accent-dark));
          color: white; border-radius: 20px; display: grid; place-items: center; font-size: 28px; font-weight: 800;
          margin-bottom: 24px; box-shadow: 0 10px 24px rgba(16, 185, 129, 0.3);
        }
        .step-title { font-size: 24px; font-weight: 700; margin: 0 0 16px; }
        .step-body { color: var(--text-muted); font-size: 17px; line-height: 1.6; margin: 0; }

        /* CTA */
        .cta-section { max-width: 1000px; margin: 120px auto; padding: 0 24px; }
        .cta-box {
          background: linear-gradient(135deg, var(--accent), var(--accent-dark));
          border-radius: 40px; padding: 80px 40px; text-align: center; color: white;
          box-shadow: 0 40px 80px rgba(16, 185, 129, 0.25); position: relative; overflow: hidden;
        }
        .cta-title { font-size: clamp(36px, 4vw, 56px); font-weight: 800; margin: 0 0 20px; letter-spacing: -0.02em; position: relative; z-index: 2; }
        .cta-subtitle { font-size: 20px; opacity: 0.9; max-width: 600px; margin: 0 auto 40px; position: relative; z-index: 2; }
        .btn-cta {
          background: white; color: var(--accent-dark); font-weight: 800; font-size: 18px; padding: 20px 40px;
          border-radius: 20px; display: inline-block; text-decoration: none; box-shadow: 0 15px 30px rgba(0,0,0,0.15);
          transition: transform 0.3s ease; position: relative; z-index: 2;
        }
        .btn-cta:hover { transform: translateY(-4px) scale(1.03); }

        /* Footer */
        .footer { background: white; padding: 80px 24px 40px; border-top: 1px solid rgba(0,0,0,0.05); }
        .footer-inner { max-width: 1200px; margin: 0 auto; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 32px; }
        .footer-links { display: flex; gap: 32px; }
        .footer-links a { color: var(--text-muted); text-decoration: none; font-weight: 500; font-size: 16px; }
        .footer-links a:hover { color: var(--accent); }
        .footer-copy { max-width: 1200px; margin: 60px auto 0; padding-top: 32px; border-top: 1px solid rgba(0,0,0,0.05); color: #94A3B8; font-size: 15px; text-align: center; }

        /* Background Parallax Elements */
        .bg-shape-1 {
          position: absolute; width: 800px; height: 800px;
          background: radial-gradient(circle, rgba(16, 185, 129, 0.05) 0%, transparent 60%);
          border-radius: 50%; z-index: 0; pointer-events: none; right: -200px; top: -100px;
          transition: transform 0.1s linear;
        }
        .bg-shape-2 {
          position: absolute; width: 1000px; height: 1000px;
          background: radial-gradient(circle, rgba(59, 130, 246, 0.03) 0%, transparent 60%);
          border-radius: 50%; z-index: 0; pointer-events: none; left: -300px; top: 40%;
          transition: transform 0.1s linear;
        }

        @media (max-width: 900px) {
          .hero-section { flex-direction: column; text-align: center; padding-top: 120px; }
          .hero-actions { justify-content: center; }
          .hero-3d-scene { height: 500px; perspective: 1000px; }
          .mockup-main { transform: scale(0.9) rotateX(0) rotateY(0) !important; }
          .mockup-float-card { right: 0; bottom: 80px; }
          .stat-strip { margin-top: 20px; }
        }
      `}} />

      {/* Parallax Background */}
      <div className="bg-shape-1" style={{ transform: `translateY(${bg1Y}px)` }} />
      <div className="bg-shape-2" style={{ transform: `translateY(${bg2Y}px)` }} />

      {/* Nav */}
      <nav className="nav-wrapper">
        <div className="nav-inner">
          <Logo />
          <div style={{ display: "flex", gap: "24px", alignItems: "center" }}>
            <Link href="/login" style={{ color: "var(--text-muted)", fontWeight: 600, textDecoration: "none" }}>Log in</Link>
            <Link href="/login" className="btn-primary">Get started</Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="hero-section">
        <div 
          className="hero-content"
          style={{ opacity: Math.max(heroOpacity, 0) }}
        >
          <div className="hero-badge">Built for real-estate sales teams 🇮🇳</div>
          <h1 className="hero-title">
            Turn every lead into a <span>booking</span>.
          </h1>
          <p className="hero-subtitle">
            Call Pro AI is the next-gen AI calling CRM for property teams. Auto-dial your leads,
            record every call, get a ringing alert the second a hot lead lands, and track every plot.
          </p>
          <div className="hero-actions">
            <Link href="/login" className="btn-primary">Start free trial</Link>
            <Link href="#how" className="btn-ghost">See how it works</Link>
          </div>
        </div>

        {/* Scroll-Linked 3D Mockup */}
        <div 
          className="hero-3d-scene"
          style={{ opacity: Math.max(heroOpacity + 0.3, 0) }}
        >
          <div 
            className="mockup-main"
            style={{ 
              transform: `rotateX(${mockupRotateX}deg) rotateY(${mockupRotateY}deg) scale(${mockupScale}) translateZ(${mockupZ}px)`,
              transition: "transform 0.1s linear"
            }}
          >
            <div className="mockup-header">
              <div style={{ fontSize: 26, fontWeight: 800, marginBottom: 12 }}>Call Pro AI</div>
              <div style={{ fontSize: 15, opacity: 0.9 }}>Auto-dialing (84 leads left)...</div>
            </div>
            <div className="mockup-body">
              <div className="mockup-card">
                <div className="mockup-avatar"></div>
                <div>
                  <div className="mockup-text-1"></div>
                  <div className="mockup-text-2"></div>
                </div>
              </div>
              <div className="mockup-card">
                <div className="mockup-avatar"></div>
                <div>
                  <div className="mockup-text-1"></div>
                  <div className="mockup-text-2"></div>
                </div>
              </div>
              <div className="mockup-card" style={{ opacity: 0.6 }}>
                <div className="mockup-avatar"></div>
                <div>
                  <div className="mockup-text-1"></div>
                  <div className="mockup-text-2"></div>
                </div>
              </div>
            </div>
          </div>
          <div className="mockup-float-card">
            <div className="mockup-pulse"></div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16 }}>Hot Lead Alert!</div>
              <div style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>Facebook Ad · 10s ago</div>
            </div>
          </div>
        </div>
      </section>

      {/* Stat Strip */}
      <section className="stat-strip">
        <div className="stat-grid">
          <div className="stat-item">
            <div className="stat-big">10 sec</div>
            <div className="stat-small">Hot-lead alert, with sound</div>
          </div>
          <div className="stat-item">
            <div className="stat-big">100s</div>
            <div className="stat-small">Leads auto-dialed</div>
          </div>
          <div className="stat-item">
            <div className="stat-big">100%</div>
            <div className="stat-small">Recorded & summarised</div>
          </div>
          <div className="stat-item">
            <div className="stat-big">1 tap</div>
            <div className="stat-small">WhatsApp & disposition</div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="features-section">
        <div className="section-header">
          <h2 className="section-title">Everything your callers need.</h2>
          <p className="section-subtitle">
            Replace the spreadsheet, the manual dialing, and the missed callbacks with an impossibly smooth 3D experience.
          </p>
        </div>
        <div className="features-grid">
          <Feature index={0} icon="📲" title="One-tap auto-dialer" body="Call hundreds of leads back-to-back. No manual dialing — the app rings the next number the moment a call ends." />
          <Feature index={1} icon="🎙️" title="AI Call Summaries" body="Every call is recorded and summarised by AI, so 'he said he called' is never an argument again." />
          <Feature index={2} icon="🔥" title="Instant hot alerts" body="The second a Facebook lead lands, the right rep gets a ringing push — call them before they go cold." />
          <Feature index={3} icon="⏰" title="Smart follow-ups" body="Reminders with sound, auto-retry on no-answer, and a clean due-today worklist. Never miss a callback." />
          <Feature index={4} icon="📊" title="AI lead scoring" body="See who's most likely to book. A clear pipeline from new → site visit → token → booked." />
          <Feature index={5} icon="💬" title="WhatsApp in one tap" body="Pre-filled templates per project — send the intro your reps type 100 times a day, instantly." />
          <Feature index={6} icon="📍" title="Site visits, verified" body="GPS-geofenced site-visit check-ins, token/booking tracking — built for how plots actually sell." />
          <Feature index={7} icon="🏆" title="Team leaderboard" body="Live rankings, talk-time, connect rates, and selfie + GPS attendance — full visibility for the owner." />
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="how-section">
        <div className="how-inner">
          <div className="section-header">
            <h2 className="section-title">From lead to booking</h2>
            <p className="section-subtitle">A simple three-step process to maximize your real-estate conversions.</p>
          </div>
          <div className="steps-grid">
            <Step index={0} n="1" title="Capture" body="Auto-capture leads from Facebook ads, import a CSV, or add a walk-in — all in one place, de-duplicated." />
            <Step index={1} n="2" title="Call & qualify" body="Auto-dial, record, set the outcome and temperature in one screen. The funnel updates itself instantly." />
            <Step index={2} n="3" title="Close" body="Track follow-ups and site visits to token and booking — and see exactly what's in your pipeline." />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="cta-section">
        <div className="cta-box">
          <h2 className="cta-title">Ready to sell more plots?</h2>
          <p className="cta-subtitle">Get your whole team calling smarter today. Setup takes exactly 5 minutes.</p>
          <Link href="/login" className="btn-cta">Get started free</Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="footer">
        <div className="footer-inner">
          <Logo />
          <div className="footer-links">
            <Link href="/login">Log in</Link>
            <Link href="/privacy">Privacy Policy</Link>
          </div>
        </div>
        <div className="footer-copy">
          © {new Date().getFullYear()} Call Pro AI · callproai.in · Real estate sales, simplified.
        </div>
      </footer>
    </div>
  );
}
