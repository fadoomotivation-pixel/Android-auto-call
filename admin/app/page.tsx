import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: { absolute: "Call Pro AI — Real Estate Sales, Simplified" },
  description: "The AI calling CRM for real-estate teams. Auto-dial leads, record every call, get 10-second hot-lead alerts, and track every plot from enquiry to booking.",
  openGraph: {
    title: "Call Pro AI — Turn every lead into a booking",
    description: "AI calling CRM built for Indian real-estate teams. Auto-dialer, call recordings, instant hot-lead alerts, smart follow-ups, and a clear funnel to booking.",
    type: "website",
  },
};

function Logo() {
  return (
    <div className="logo-container">
      <span className="logo-icon">📞</span>
      <span className="logo-text">Call Pro AI</span>
    </div>
  );
}

function Feature({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="feature-card">
      <div className="feature-icon-wrapper">{icon}</div>
      <h3 className="feature-title">{title}</h3>
      <p className="feature-body">{body}</p>
    </div>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="step-card">
      <div className="step-number">{n}</div>
      <h3 className="step-title">{title}</h3>
      <p className="step-body">{body}</p>
    </div>
  );
}

export default function Landing() {
  return (
    <>
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
        /* 3D Floating Animations */
        @keyframes float {
          0% { transform: translateY(0px) rotateX(10deg) rotateY(-15deg); }
          50% { transform: translateY(-20px) rotateX(12deg) rotateY(-12deg); }
          100% { transform: translateY(0px) rotateX(10deg) rotateY(-15deg); }
        }
        @keyframes float-reverse {
          0% { transform: translateY(0px) rotateX(5deg) rotateY(15deg); }
          50% { transform: translateY(20px) rotateX(8deg) rotateY(12deg); }
          100% { transform: translateY(0px) rotateX(5deg) rotateY(15deg); }
        }
        @keyframes pulse-glow {
          0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.4); }
          70% { box-shadow: 0 0 0 20px rgba(16, 185, 129, 0); }
          100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
        }

        /* Nav */
        .nav-wrapper {
          position: sticky;
          top: 0;
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
          width: 38px;
          height: 38px;
          border-radius: 12px;
          display: grid;
          place-items: center;
          background: linear-gradient(135deg, var(--accent), var(--accent-dark));
          box-shadow: 0 8px 16px rgba(16, 185, 129, 0.3), inset 0 2px 4px rgba(255,255,255,0.3);
          font-size: 20px;
          color: white;
        }
        .logo-text {
          font-size: 20px;
          color: var(--text-main);
        }

        /* Buttons */
        .btn-primary {
          background: linear-gradient(135deg, var(--accent), var(--accent-dark));
          color: white;
          font-weight: 700;
          font-size: 15px;
          padding: 12px 24px;
          border-radius: 14px;
          text-decoration: none;
          box-shadow: 0 10px 20px rgba(16, 185, 129, 0.25), inset 0 2px 4px rgba(255,255,255,0.2);
          transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
          border: none;
          cursor: pointer;
        }
        .btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 15px 25px rgba(16, 185, 129, 0.35), inset 0 2px 4px rgba(255,255,255,0.2);
        }
        .btn-ghost {
          color: var(--text-main);
          font-weight: 600;
          font-size: 15px;
          padding: 12px 24px;
          border-radius: 14px;
          text-decoration: none;
          background: white;
          border: 1px solid rgba(0,0,0,0.08);
          box-shadow: 0 4px 12px rgba(0,0,0,0.03);
          transition: all 0.3s ease;
        }
        .btn-ghost:hover {
          background: #f1f5f9;
          transform: translateY(-2px);
          box-shadow: 0 8px 16px rgba(0,0,0,0.06);
        }

        /* Hero */
        .hero-section {
          position: relative;
          padding: 80px 24px 60px;
          max-width: 1200px;
          margin: 0 auto;
          display: flex;
          align-items: center;
          gap: 40px;
          z-index: 10;
        }
        .hero-content {
          flex: 1;
          max-width: 600px;
        }
        .hero-badge {
          display: inline-block;
          font-size: 14px;
          font-weight: 700;
          color: var(--accent-dark);
          background: rgba(16, 185, 129, 0.1);
          padding: 8px 16px;
          border-radius: 50px;
          margin-bottom: 24px;
          box-shadow: 0 4px 12px rgba(16, 185, 129, 0.05);
        }
        .hero-title {
          font-size: clamp(40px, 5vw, 64px);
          line-height: 1.1;
          font-weight: 800;
          letter-spacing: -0.03em;
          margin: 0 0 24px;
          color: var(--text-main);
        }
        .hero-title span {
          color: var(--accent);
          position: relative;
          display: inline-block;
        }
        .hero-title span::after {
          content: '';
          position: absolute;
          bottom: 8px;
          left: 0;
          width: 100%;
          height: 12px;
          background: rgba(16, 185, 129, 0.2);
          z-index: -1;
          border-radius: 6px;
        }
        .hero-subtitle {
          font-size: clamp(17px, 2vw, 20px);
          color: var(--text-muted);
          line-height: 1.6;
          margin: 0 0 32px;
        }
        .hero-actions {
          display: flex;
          gap: 16px;
          flex-wrap: wrap;
        }

        /* 3D Scene */
        .hero-3d-scene {
          flex: 1;
          perspective: 1200px;
          position: relative;
          height: 500px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .mockup-main {
          width: 280px;
          height: 580px;
          background: white;
          border-radius: 36px;
          border: 8px solid #E2E8F0;
          box-shadow: 
            25px 35px 60px rgba(0, 0, 0, 0.1),
            -10px -10px 30px rgba(255, 255, 255, 0.8),
            inset 0 0 0 2px #F1F5F9;
          animation: float 6s ease-in-out infinite;
          position: relative;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        /* Mobile UI Mockup details */
        .mockup-header {
          background: var(--accent);
          height: 120px;
          padding: 24px 16px;
          color: white;
        }
        .mockup-body {
          background: #F8FAFC;
          flex: 1;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .mockup-card {
          background: white;
          border-radius: 12px;
          padding: 12px;
          box-shadow: 0 4px 10px rgba(0,0,0,0.04);
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .mockup-avatar {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: #E2E8F0;
        }
        .mockup-text-1 { width: 100px; height: 12px; background: #E2E8F0; border-radius: 6px; margin-bottom: 6px; }
        .mockup-text-2 { width: 140px; height: 10px; background: #F1F5F9; border-radius: 6px; }
        
        .mockup-float-card {
          position: absolute;
          right: -40px;
          bottom: 120px;
          background: white;
          padding: 16px;
          border-radius: 16px;
          box-shadow: 15px 20px 40px rgba(0,0,0,0.12);
          animation: float-reverse 7s ease-in-out infinite;
          display: flex;
          align-items: center;
          gap: 12px;
          border: 1px solid rgba(255,255,255,0.8);
          backdrop-filter: blur(8px);
        }
        .mockup-pulse {
          width: 12px;
          height: 12px;
          background: var(--accent);
          border-radius: 50%;
          animation: pulse-glow 2s infinite;
        }

        /* Stat Strip */
        .stat-strip {
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 24px;
          position: relative;
          z-index: 20;
          margin-top: -30px;
        }
        .stat-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 20px;
          background: white;
          border-radius: 24px;
          padding: 32px 24px;
          box-shadow: 
            0 20px 40px rgba(0,0,0,0.04),
            0 1px 3px rgba(0,0,0,0.02);
        }
        .stat-item {
          text-align: center;
        }
        .stat-big {
          font-size: 32px;
          font-weight: 800;
          color: var(--accent);
          letter-spacing: -0.02em;
          margin-bottom: 8px;
        }
        .stat-small {
          font-size: 15px;
          color: var(--text-muted);
          font-weight: 500;
        }

        /* Features */
        .features-section {
          max-width: 1200px;
          margin: 100px auto;
          padding: 0 24px;
        }
        .section-header {
          text-align: center;
          margin-bottom: 60px;
        }
        .section-title {
          font-size: clamp(28px, 4vw, 40px);
          font-weight: 800;
          letter-spacing: -0.02em;
          margin: 0 0 16px;
        }
        .section-subtitle {
          color: var(--text-muted);
          font-size: 18px;
          max-width: 600px;
          margin: 0 auto;
        }
        .features-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 24px;
        }
        .feature-card {
          background: white;
          border-radius: 24px;
          padding: 32px 24px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.03);
          border: 1px solid rgba(0,0,0,0.02);
          transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
          position: relative;
          z-index: 1;
        }
        .feature-card:hover {
          transform: translateY(-10px) scale(1.02);
          box-shadow: 0 20px 40px rgba(16, 185, 129, 0.08);
          z-index: 2;
        }
        .feature-icon-wrapper {
          width: 56px;
          height: 56px;
          background: rgba(16, 185, 129, 0.1);
          border-radius: 16px;
          display: grid;
          place-items: center;
          font-size: 28px;
          margin-bottom: 20px;
          box-shadow: inset 0 2px 4px rgba(255,255,255,0.5);
        }
        .feature-title {
          font-size: 20px;
          font-weight: 700;
          margin: 0 0 12px;
          letter-spacing: -0.01em;
        }
        .feature-body {
          color: var(--text-muted);
          font-size: 15px;
          line-height: 1.6;
          margin: 0;
        }

        /* How it works */
        .how-section {
          background: white;
          padding: 100px 24px;
          position: relative;
          overflow: hidden;
        }
        .how-inner {
          max-width: 1200px;
          margin: 0 auto;
        }
        .steps-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 40px;
          position: relative;
        }
        .step-card {
          position: relative;
          z-index: 2;
        }
        .step-number {
          width: 50px;
          height: 50px;
          background: linear-gradient(135deg, var(--accent), var(--accent-dark));
          color: white;
          border-radius: 16px;
          display: grid;
          place-items: center;
          font-size: 24px;
          font-weight: 800;
          margin-bottom: 24px;
          box-shadow: 0 8px 20px rgba(16, 185, 129, 0.3);
        }
        .step-title {
          font-size: 22px;
          font-weight: 700;
          margin: 0 0 12px;
        }
        .step-body {
          color: var(--text-muted);
          font-size: 16px;
          line-height: 1.6;
          margin: 0;
        }

        /* CTA */
        .cta-section {
          max-width: 1000px;
          margin: 100px auto;
          padding: 0 24px;
        }
        .cta-box {
          background: linear-gradient(135deg, var(--accent), var(--accent-dark));
          border-radius: 32px;
          padding: 60px 40px;
          text-align: center;
          color: white;
          box-shadow: 0 30px 60px rgba(16, 185, 129, 0.25);
          position: relative;
          overflow: hidden;
        }
        .cta-box::before {
          content: '';
          position: absolute;
          top: -50%;
          left: -50%;
          width: 200%;
          height: 200%;
          background: radial-gradient(circle, rgba(255,255,255,0.2) 0%, transparent 60%);
          animation: float 10s infinite;
          pointer-events: none;
        }
        .cta-title {
          font-size: clamp(32px, 4vw, 48px);
          font-weight: 800;
          margin: 0 0 16px;
          letter-spacing: -0.02em;
        }
        .cta-subtitle {
          font-size: 18px;
          opacity: 0.9;
          max-width: 600px;
          margin: 0 auto 32px;
        }
        .btn-cta {
          background: white;
          color: var(--accent-dark);
          font-weight: 800;
          font-size: 16px;
          padding: 16px 32px;
          border-radius: 16px;
          display: inline-block;
          text-decoration: none;
          box-shadow: 0 10px 20px rgba(0,0,0,0.1);
          transition: transform 0.3s ease;
        }
        .btn-cta:hover {
          transform: translateY(-3px) scale(1.02);
        }

        /* Footer */
        .footer {
          background: white;
          padding: 60px 24px 40px;
          border-top: 1px solid rgba(0,0,0,0.05);
        }
        .footer-inner {
          max-width: 1200px;
          margin: 0 auto;
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 24px;
        }
        .footer-links {
          display: flex;
          gap: 24px;
        }
        .footer-links a {
          color: var(--text-muted);
          text-decoration: none;
          font-weight: 500;
        }
        .footer-links a:hover {
          color: var(--accent);
        }
        .footer-copy {
          max-width: 1200px;
          margin: 40px auto 0;
          padding-top: 24px;
          border-top: 1px solid rgba(0,0,0,0.05);
          color: #94A3B8;
          font-size: 14px;
          text-align: center;
        }

        /* Background 3D Elements */
        .bg-shape-1 {
          position: absolute;
          top: -100px;
          right: -100px;
          width: 500px;
          height: 500px;
          background: radial-gradient(circle, rgba(16, 185, 129, 0.08) 0%, transparent 70%);
          border-radius: 50%;
          z-index: 0;
          pointer-events: none;
        }
        .bg-shape-2 {
          position: absolute;
          top: 400px;
          left: -200px;
          width: 600px;
          height: 600px;
          background: radial-gradient(circle, rgba(59, 130, 246, 0.05) 0%, transparent 70%);
          border-radius: 50%;
          z-index: 0;
          pointer-events: none;
        }

        @media (max-width: 900px) {
          .hero-section {
            flex-direction: column;
            text-align: center;
            padding-top: 40px;
          }
          .hero-actions {
            justify-content: center;
          }
          .hero-3d-scene {
            height: 400px;
            perspective: 800px;
          }
          .mockup-main {
            transform: scale(0.85);
          }
          .mockup-float-card {
            right: -10px;
            bottom: 60px;
          }
        }
      `}} />

      <div className="bg-shape-1"></div>
      <div className="bg-shape-2"></div>

      {/* Nav */}
      <nav className="nav-wrapper">
        <div className="nav-inner">
          <Logo />
          <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
            <Link href="/login" style={{ color: "var(--text-muted)", fontWeight: 600, textDecoration: "none" }}>Log in</Link>
            <Link href="/login" className="btn-primary">Get started</Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="hero-section">
        <div className="hero-content">
          <div className="hero-badge">Built for real-estate sales teams 🇮🇳</div>
          <h1 className="hero-title">
            Turn every lead into a <span>booking</span>.
          </h1>
          <p className="hero-subtitle">
            Call Pro AI is the 3D-powered AI calling CRM for property teams. Auto-dial your leads,
            record every call, get a ringing alert the second a hot lead lands, and track every plot.
          </p>
          <div className="hero-actions">
            <Link href="/login" className="btn-primary">Start free trial</Link>
            <Link href="#how" className="btn-ghost">See how it works</Link>
          </div>
        </div>
        <div className="hero-3d-scene">
          <div className="mockup-main">
            <div className="mockup-header">
              <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>Call Pro AI</div>
              <div style={{ fontSize: 14, opacity: 0.9 }}>Auto-dialing...</div>
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
              <div style={{ fontWeight: 700, fontSize: 14 }}>Hot Lead Alert!</div>
              <div style={{ color: "var(--text-muted)", fontSize: 12 }}>Facebook Ad · 10s ago</div>
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
          <p className="section-subtitle">Replace the spreadsheet, the manual dialing, and the missed callbacks with a buttery-smooth 3D experience.</p>
        </div>
        <div className="features-grid">
          <Feature icon="📲" title="One-tap auto-dialer" body="Call hundreds of leads back-to-back. No manual dialing — the app rings the next number the moment a call ends." />
          <Feature icon="🎙️" title="AI Call Summaries" body="Every call is recorded and summarised by AI, so 'he said he called' is never an argument again." />
          <Feature icon="🔥" title="Instant hot alerts" body="The second a Facebook lead lands, the right rep gets a ringing push — call them before they go cold." />
          <Feature icon="⏰" title="Smart follow-ups" body="Reminders with sound, auto-retry on no-answer, and a clean due-today worklist. Never miss a callback." />
          <Feature icon="📊" title="AI lead scoring" body="See who's most likely to book. A clear pipeline from new → site visit → token → booked." />
          <Feature icon="💬" title="WhatsApp in one tap" body="Pre-filled templates per project — send the intro your reps type 100 times a day, instantly." />
          <Feature icon="📍" title="Site visits, verified" body="GPS-geofenced site-visit check-ins, token/booking tracking — built for how plots actually sell." />
          <Feature icon="🏆" title="Team leaderboard" body="Live rankings, talk-time, connect rates, and selfie + GPS attendance — full visibility for the owner." />
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
            <Step n="1" title="Capture" body="Auto-capture leads from Facebook ads, import a CSV, or add a walk-in — all in one place, de-duplicated." />
            <Step n="2" title="Call & qualify" body="Auto-dial, record, set the outcome and temperature in one screen. The funnel updates itself instantly." />
            <Step n="3" title="Close" body="Track follow-ups and site visits to token and booking — and see exactly what's in your pipeline." />
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
    </>
  );
}
