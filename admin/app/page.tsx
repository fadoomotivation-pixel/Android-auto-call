import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: { absolute: "Call Pro AI — Real Estate Sales, Simplified" },
  description:
    "The AI calling CRM for real-estate teams. Auto-dial leads, record every call, get 10-second hot-lead alerts, and track every plot from enquiry to booking.",
  openGraph: {
    title: "Call Pro AI — Turn every lead into a booking",
    description:
      "AI calling CRM built for Indian real-estate teams. Auto-dialer, call recordings, instant hot-lead alerts, smart follow-ups, and a clear funnel to booking.",
    type: "website",
  },
};

const ACCENT = "#22C55E";
const BG = "#020617";

function Logo() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 800, letterSpacing: "-0.02em" }}>
      <span
        style={{
          width: 34, height: 34, borderRadius: 10, display: "grid", placeItems: "center",
          background: "linear-gradient(135deg, #16A34A, #22C55E)", boxShadow: "0 4px 16px rgba(34,197,94,0.4)", fontSize: 18,
        }}
      >
        📞
      </span>
      <span style={{ fontSize: 18, color: "#fff" }}>Call Pro AI</span>
    </div>
  );
}

function Feature({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div
      style={{
        background: "rgba(15,23,42,0.6)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16,
        padding: "24px 22px", backdropFilter: "blur(12px)",
      }}
    >
      <div style={{ fontSize: 26, marginBottom: 12 }}>{icon}</div>
      <h3 style={{ margin: "0 0 8px", fontSize: 17, fontWeight: 700, color: "#fff", letterSpacing: "-0.01em" }}>{title}</h3>
      <p style={{ margin: 0, color: "#94a3b8", fontSize: 14.5, lineHeight: 1.55 }}>{body}</p>
    </div>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div style={{ flex: 1, minWidth: 220 }}>
      <div
        style={{
          width: 40, height: 40, borderRadius: 12, display: "grid", placeItems: "center", fontWeight: 800,
          background: "rgba(34,197,94,0.15)", color: ACCENT, border: "1px solid rgba(34,197,94,0.3)", marginBottom: 14,
        }}
      >
        {n}
      </div>
      <h3 style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 700, color: "#fff" }}>{title}</h3>
      <p style={{ margin: 0, color: "#94a3b8", fontSize: 14.5, lineHeight: 1.55 }}>{body}</p>
    </div>
  );
}

const btnPrimary: React.CSSProperties = {
  background: "linear-gradient(135deg, #16A34A, #22C55E)", color: "#04130A", fontWeight: 700, fontSize: 15,
  padding: "12px 22px", borderRadius: 12, boxShadow: "0 8px 24px rgba(34,197,94,0.35)", display: "inline-block",
};
const btnGhost: React.CSSProperties = {
  color: "#F8FAFC", fontWeight: 600, fontSize: 15, padding: "12px 20px", borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.15)", display: "inline-block",
};

export default function Landing() {
  return (
    <main style={{ background: BG, color: "#F8FAFC", minHeight: "100vh", overflowX: "hidden", position: "relative" }}>
      {/* glow */}
      <div
        style={{
          position: "absolute", top: -180, left: "50%", transform: "translateX(-50%)", width: 900, height: 500,
          background: "radial-gradient(closest-side, rgba(34,197,94,0.18), transparent)", pointerEvents: "none", zIndex: 0,
        }}
      />

      {/* nav */}
      <nav
        style={{
          position: "relative", zIndex: 2, maxWidth: 1140, margin: "0 auto", padding: "22px 24px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}
      >
        <Logo />
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Link href="/login" style={{ color: "#cbd5e1", fontWeight: 600, fontSize: 15 }}>Log in</Link>
          <Link href="/login" style={btnPrimary}>Get started</Link>
        </div>
      </nav>

      {/* hero */}
      <section style={{ position: "relative", zIndex: 1, maxWidth: 880, margin: "0 auto", padding: "60px 24px 30px", textAlign: "center" }}>
        <div
          style={{
            display: "inline-block", fontSize: 13, fontWeight: 600, color: ACCENT, background: "rgba(34,197,94,0.1)",
            border: "1px solid rgba(34,197,94,0.25)", padding: "6px 14px", borderRadius: 50, marginBottom: 22,
          }}
        >
          Built for real-estate sales teams 🇮🇳
        </div>
        <h1 style={{ fontSize: "clamp(34px, 6vw, 56px)", lineHeight: 1.05, fontWeight: 800, letterSpacing: "-0.03em", margin: "0 0 18px" }}>
          Turn every lead into a <span style={{ color: ACCENT }}>booking</span>.
        </h1>
        <p style={{ fontSize: "clamp(16px, 2.4vw, 19px)", color: "#94a3b8", lineHeight: 1.6, maxWidth: 620, margin: "0 auto 30px" }}>
          Call Pro AI is the AI calling CRM for property teams. Auto-dial your leads,
          record every call, get a ringing alert the second a hot lead lands, and
          track every plot from enquiry to token.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/login" style={btnPrimary}>Start free</Link>
          <Link href="#how" style={btnGhost}>See how it works</Link>
        </div>
        <p style={{ marginTop: 16, fontSize: 13, color: "#64748b" }}>No setup fees · Works on any Android phone · Your SIM, your numbers</p>
      </section>

      {/* stat strip */}
      <section style={{ position: "relative", zIndex: 1, maxWidth: 1000, margin: "20px auto 0", padding: "0 24px" }}>
        <div
          style={{
            display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14,
            background: "rgba(15,23,42,0.5)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 18, padding: 24,
          }}
        >
          {[
            ["10 sec", "Hot-lead alert, with sound"],
            ["100s", "Leads auto-dialed back-to-back"],
            ["Every call", "Recorded + AI-summarised"],
            ["1 tap", "WhatsApp, follow-up, disposition"],
          ].map(([big, small]) => (
            <div key={small} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 26, fontWeight: 800, color: "#fff", letterSpacing: "-0.02em" }}>{big}</div>
              <div style={{ fontSize: 13.5, color: "#94a3b8", marginTop: 4 }}>{small}</div>
            </div>
          ))}
        </div>
      </section>

      {/* features */}
      <section style={{ position: "relative", zIndex: 1, maxWidth: 1140, margin: "70px auto 0", padding: "0 24px" }}>
        <h2 style={{ textAlign: "center", fontSize: "clamp(26px, 4vw, 34px)", fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 10px" }}>
          Everything your callers need. One app.
        </h2>
        <p style={{ textAlign: "center", color: "#94a3b8", fontSize: 16, margin: "0 auto 40px", maxWidth: 560 }}>
          Replace the spreadsheet, the manual dialing, and the missed callbacks.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
          <Feature icon="📲" title="One-tap auto-dialer" body="Call hundreds of leads back-to-back. No manual dialing — the app rings the next number the moment a call ends." />
          <Feature icon="🎙️" title="Calls recorded + AI summary" body="Every call is recorded and summarised by AI, so 'he said he called' is never an argument again." />
          <Feature icon="🔥" title="Instant hot-lead alerts" body="The second a Facebook lead lands, the right rep gets a ringing push — call them before they go cold." />
          <Feature icon="⏰" title="Smart follow-ups" body="Reminders with sound, auto-retry on no-answer, and a clean due-today worklist. Never miss a callback." />
          <Feature icon="📊" title="AI lead scoring & funnel" body="See who's most likely to book. A clear pipeline from new → site visit → token → booked." />
          <Feature icon="💬" title="WhatsApp in one tap" body="Pre-filled Hinglish templates per project — send the intro your reps type 100 times a day, instantly." />
          <Feature icon="📍" title="Site visits, verified" body="GPS-geofenced site-visit check-ins, token/booking tracking — built for how plots actually sell." />
          <Feature icon="🏆" title="Team leaderboard" body="Live rankings, talk-time, connect rates, and selfie + GPS attendance — full visibility for the owner." />
        </div>
      </section>

      {/* how it works */}
      <section id="how" style={{ position: "relative", zIndex: 1, maxWidth: 1000, margin: "80px auto 0", padding: "0 24px" }}>
        <h2 style={{ textAlign: "center", fontSize: "clamp(26px, 4vw, 34px)", fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 44px" }}>
          From lead to booking in three steps
        </h2>
        <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
          <Step n="1" title="Capture" body="Auto-capture leads from Facebook ads, import a CSV, or add a walk-in — all in one place, de-duplicated." />
          <Step n="2" title="Call & qualify" body="Auto-dial, record, set the outcome and temperature in one screen. The funnel updates itself." />
          <Step n="3" title="Close" body="Track follow-ups and site visits to token and booking — and see exactly what's in your pipeline." />
        </div>
      </section>

      {/* CTA band */}
      <section style={{ position: "relative", zIndex: 1, maxWidth: 1000, margin: "80px auto 0", padding: "0 24px" }}>
        <div
          style={{
            background: "linear-gradient(135deg, rgba(34,197,94,0.16), rgba(15,23,42,0.6))",
            border: "1px solid rgba(34,197,94,0.25)", borderRadius: 22, padding: "44px 28px", textAlign: "center",
          }}
        >
          <h2 style={{ fontSize: "clamp(24px, 4vw, 32px)", fontWeight: 800, margin: "0 0 12px", letterSpacing: "-0.02em" }}>
            Ready to sell more plots?
          </h2>
          <p style={{ color: "#cbd5e1", fontSize: 16, margin: "0 auto 24px", maxWidth: 520 }}>
            Get your whole team calling smarter today. Set up in minutes.
          </p>
          <Link href="/login" style={btnPrimary}>Get started free</Link>
        </div>
      </section>

      {/* footer */}
      <footer style={{ position: "relative", zIndex: 1, maxWidth: 1140, margin: "70px auto 0", padding: "28px 24px 40px", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
          <Logo />
          <div style={{ display: "flex", gap: 20, fontSize: 14, color: "#94a3b8" }}>
            <Link href="/login" style={{ color: "#94a3b8" }}>Log in</Link>
            <Link href="/privacy" style={{ color: "#94a3b8" }}>Privacy</Link>
          </div>
        </div>
        <p style={{ color: "#64748b", fontSize: 13, marginTop: 18 }}>
          © {new Date().getFullYear()} Call Pro AI · callproai.in · Real estate sales, simplified.
        </p>
      </footer>
    </main>
  );
}
