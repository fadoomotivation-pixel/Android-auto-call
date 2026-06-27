"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

const CSS = `
.cp{--ink:#0c0c14;--bg:#FAF8F3;--card:#fff;--muted:#5b5b6b;--line:rgba(12,12,20,.08);
--grape:#7C5CFC;--blue:#3B6EF6;--mint:#16B981;--coral:#FF7A66;--amber:#FFB020;--sky:#37C0F6;
position:relative;overflow-x:hidden;background:var(--bg);color:var(--ink);
font-family:'Plus Jakarta Sans',system-ui,-apple-system,sans-serif;-webkit-font-smoothing:antialiased;}
.cp *{box-sizing:border-box;}
.cp a{color:inherit;text-decoration:none;}
.cp h1,.cp h2,.cp h3{margin:0;letter-spacing:-0.03em;}
.cp-mesh{position:absolute;inset:0;top:0;height:1100px;z-index:0;pointer-events:none;overflow:hidden;}
.cp-blobw{position:absolute;transition:transform .25s ease-out;}
.cp-blob{border-radius:50%;filter:blur(70px);opacity:.55;animation:cpFloatSlow 14s ease-in-out infinite;}
@keyframes cpFloatSlow{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(24px,-26px) scale(1.12)}}
.cp-wrap{position:relative;z-index:1;max-width:1180px;margin:0 auto;padding:0 22px;}
.cp-nav{position:sticky;top:0;z-index:40;backdrop-filter:blur(14px);background:rgba(250,248,243,.72);border-bottom:1px solid var(--line);}
.cp-navin{display:flex;align-items:center;justify-content:space-between;max-width:1180px;margin:0 auto;padding:15px 22px;}
.cp-logo{display:flex;align-items:center;gap:10px;font-weight:800;font-size:18px;}
.cp-lb{width:36px;height:36px;border-radius:11px;display:grid;place-items:center;font-size:18px;color:#fff;
background:linear-gradient(135deg,var(--grape),var(--blue));box-shadow:0 8px 20px rgba(124,92,252,.4);}
.cp-btn{display:inline-flex;align-items:center;gap:8px;font-weight:700;font-size:15px;padding:12px 22px;border-radius:14px;transition:transform .2s,box-shadow .2s;cursor:pointer;}
.cp-primary{color:#fff;background:linear-gradient(135deg,var(--grape),var(--blue));box-shadow:0 12px 28px rgba(59,110,246,.35);}
.cp-primary:hover{transform:translateY(-2px);box-shadow:0 18px 38px rgba(59,110,246,.45);}
.cp-ghost{background:#fff;border:1px solid var(--line);box-shadow:0 6px 18px rgba(12,12,20,.06);}
.cp-ghost:hover{transform:translateY(-2px);}
.cp-navlink{color:var(--muted);font-weight:600;font-size:15px;}
.cp-hero{display:grid;grid-template-columns:1.05fr .95fr;gap:24px;align-items:center;padding:54px 0 30px;}
.cp-badge{display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:700;color:var(--grape);
background:rgba(124,92,252,.1);border:1px solid rgba(124,92,252,.22);padding:7px 14px;border-radius:50px;}
.cp-h1{font-size:clamp(38px,6.2vw,70px);line-height:1.02;font-weight:800;margin:18px 0;}
.cp-grad{background:linear-gradient(120deg,var(--grape),var(--blue) 42%,var(--mint));-webkit-background-clip:text;background-clip:text;color:transparent;}
.cp-sub{font-size:clamp(16px,2vw,19px);color:var(--muted);line-height:1.62;max-width:540px;}
.cp-cta{display:flex;gap:12px;flex-wrap:wrap;margin-top:26px;}
.cp-trust{display:flex;gap:18px;flex-wrap:wrap;margin-top:22px;color:var(--muted);font-size:13.5px;font-weight:600;}
.cp-trust span{display:inline-flex;align-items:center;gap:6px;}
.cp-stage{position:relative;height:540px;perspective:1300px;display:flex;align-items:center;justify-content:center;}
.cp-phone{width:262px;height:524px;border-radius:44px;padding:11px;transform-style:preserve-3d;transition:transform .15s ease-out;
background:linear-gradient(160deg,#14141d,#262633);box-shadow:0 44px 90px -22px rgba(59,110,246,.5),0 22px 44px rgba(12,12,20,.28);}
.cp-screen{position:relative;width:100%;height:100%;border-radius:34px;overflow:hidden;background:#FAF8F3;}
.cp-status{height:34px;display:flex;align-items:center;justify-content:space-between;padding:0 18px;font-size:11px;font-weight:700;color:#0c0c14;}
.cp-apphead{padding:8px 16px 12px;}
.cp-appttl{font-weight:800;font-size:16px;}
.cp-appsub{color:var(--muted);font-size:11px;}
.cp-statcard{margin:0 14px;border-radius:16px;padding:12px 14px;color:#fff;background:linear-gradient(135deg,var(--grape),var(--blue));box-shadow:0 14px 26px -8px rgba(59,110,246,.5);}
.cp-statn{font-size:24px;font-weight:800;}
.cp-leadcard{margin:10px 14px 0;background:#fff;border:1px solid var(--line);border-radius:14px;padding:10px 12px;display:flex;align-items:center;gap:10px;box-shadow:0 8px 18px -8px rgba(12,12,20,.14);}
.cp-av{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;font-weight:800;color:#fff;font-size:14px;}
.cp-callpill{margin-left:auto;font-size:11px;font-weight:800;color:#fff;background:var(--mint);padding:6px 12px;border-radius:50px;}
.cp-parw{position:absolute;transition:transform .25s ease-out;z-index:3;}
.cp-float{background:#fff;border:1px solid var(--line);border-radius:16px;padding:11px 14px;display:flex;align-items:center;gap:10px;font-weight:700;font-size:13px;
box-shadow:0 22px 44px -12px rgba(12,12,20,.22);animation:cpFloat 5s ease-in-out infinite;}
.cp-fi{width:34px;height:34px;border-radius:11px;display:grid;place-items:center;font-size:17px;color:#fff;}
@keyframes cpFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-14px)}}
.cp-marq{overflow:hidden;border-top:1px solid var(--line);border-bottom:1px solid var(--line);background:#fff;padding:16px 0;margin-top:24px;}
.cp-marqrow{display:flex;width:max-content;gap:34px;animation:cpMarq 28s linear infinite;font-weight:800;font-size:clamp(16px,2.2vw,24px);color:#0c0c14;}
.cp-marqrow b{color:var(--blue);}
@keyframes cpMarq{from{transform:translateX(0)}to{transform:translateX(-50%)}}
.cp-sec{padding:84px 0;}
.cp-kick{font-weight:800;color:var(--blue);text-transform:uppercase;letter-spacing:.14em;font-size:13px;}
.cp-h2{font-size:clamp(30px,4.6vw,48px);font-weight:800;line-height:1.05;margin:12px 0 14px;}
.cp-leadp{color:var(--muted);font-size:17px;line-height:1.62;max-width:660px;}
.cp-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(248px,1fr));gap:18px;margin-top:40px;}
.cp-card{background:var(--card);border:1px solid var(--line);border-radius:22px;padding:26px 22px;box-shadow:0 18px 40px -18px rgba(12,12,20,.14);transition:transform .25s,box-shadow .25s;}
.cp-card:hover{transform:translateY(-7px) rotate(-.5deg);box-shadow:0 34px 64px -20px rgba(59,110,246,.32);}
.cp-cic{width:54px;height:54px;border-radius:16px;display:grid;place-items:center;font-size:25px;margin-bottom:16px;color:#fff;box-shadow:0 12px 24px -8px rgba(0,0,0,.25);}
.cp-card h3{font-size:18px;font-weight:800;margin-bottom:7px;}
.cp-card p{margin:0;color:var(--muted);font-size:14.5px;line-height:1.55;}
.cp-trio{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:18px;margin-top:36px;}
.cp-trio .cp-card h3{font-size:17px;}
.cp-steps{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:18px;margin-top:40px;}
.cp-step{background:var(--card);border:1px solid var(--line);border-radius:22px;padding:26px 22px;box-shadow:0 18px 40px -18px rgba(12,12,20,.12);}
.cp-stepn{font-size:44px;font-weight:800;line-height:1;background:linear-gradient(135deg,var(--grape),var(--mint));-webkit-background-clip:text;background-clip:text;color:transparent;}
.cp-step h3{font-size:18px;font-weight:800;margin:10px 0 6px;}
.cp-step p{margin:0;color:var(--muted);font-size:14.5px;line-height:1.55;}
.cp-band{border-radius:34px;padding:62px 30px;text-align:center;color:#fff;position:relative;overflow:hidden;
background:linear-gradient(135deg,var(--grape),var(--blue) 55%,var(--mint));box-shadow:0 44px 90px -28px rgba(59,110,246,.55);}
.cp-band h2{font-size:clamp(28px,4.4vw,44px);font-weight:800;margin-bottom:14px;}
.cp-band p{color:rgba(255,255,255,.9);font-size:17px;max-width:520px;margin:0 auto 26px;}
.cp-bandbtn{background:#fff;color:var(--blue);}
.cp-foot{border-top:1px solid var(--line);padding:34px 0 52px;color:var(--muted);}
.cp-reveal{opacity:0;transform:translateY(28px);transition:opacity .7s ease,transform .7s cubic-bezier(.2,.7,.2,1);}
.cp-reveal.in{opacity:1;transform:none;}
@media(max-width:900px){
 .cp-hero{grid-template-columns:1fr;text-align:center;padding-top:40px;}
 .cp-sub,.cp-leadp{margin-left:auto;margin-right:auto;}
 .cp-cta,.cp-trust{justify-content:center;}
 .cp-stage{height:500px;margin-top:6px;}
 .cp-phone{transform:rotateY(-8deg) rotateX(4deg);}
 .cp-hidesm{display:none;}
}
`;

function Logo() {
  return (
    <div className="cp-logo">
      <span className="cp-lb">📞</span>
      <span>Call Pro AI</span>
    </div>
  );
}

const FEATURES: [string, string, string, string][] = [
  ["📲", "linear-gradient(135deg,#7C5CFC,#3B6EF6)", "One-tap auto-dialer", "Call hundreds of leads back-to-back. The app rings the next number the second a call ends — no manual dialing."],
  ["🎙️", "linear-gradient(135deg,#3B6EF6,#37C0F6)", "Every call recorded + AI summary", "Recordings and an AI summary on every call, so ‘he said he called’ is never an argument again."],
  ["🔥", "linear-gradient(135deg,#FF7A66,#FFB020)", "10-second hot-lead alerts", "The instant a Facebook lead lands, the right rep gets a ringing push — call them before they go cold."],
  ["⏰", "linear-gradient(135deg,#16B981,#37C0F6)", "Smart follow-ups", "Reminders with sound, auto-retry on no-answer, and a clean due-today list. Never miss a callback."],
  ["📊", "linear-gradient(135deg,#7C5CFC,#FF7A66)", "AI lead scoring & funnel", "AI ranks leads by booking probability and tracks each one new → site visit → token → booked."],
  ["💬", "linear-gradient(135deg,#16B981,#3B6EF6)", "WhatsApp in one tap", "Pre-filled Hinglish templates per project — send the intro your reps type 100 times a day, instantly."],
  ["📍", "linear-gradient(135deg,#FFB020,#FF7A66)", "Site visits, verified", "GPS-geofenced site-visit check-ins and token/booking tracking — built for how plots actually sell."],
  ["🏆", "linear-gradient(135deg,#3B6EF6,#7C5CFC)", "Owner dashboard & leaderboard", "Live rankings, talk-time, connect rates and selfie + GPS attendance — full visibility for the owner."],
];

export default function Landing() {
  const heroRef = useRef<HTMLDivElement>(null);
  const phoneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const hero = heroRef.current;
    const phone = phoneRef.current;
    const onMove = (e: MouseEvent) => {
      if (!hero) return;
      const r = hero.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      hero.style.setProperty("--mx", String(x));
      hero.style.setProperty("--my", String(y));
      if (phone) phone.style.transform = `rotateY(${-16 + x * 14}deg) rotateX(${6 - y * 10}deg)`;
    };
    window.addEventListener("mousemove", onMove);

    const io = new IntersectionObserver(
      (entries) => entries.forEach((en) => { if (en.isIntersecting) en.target.classList.add("in"); }),
      { threshold: 0.14 },
    );
    document.querySelectorAll(".cp-reveal").forEach((el) => io.observe(el));

    return () => { window.removeEventListener("mousemove", onMove); io.disconnect(); };
  }, []);

  const par = (mx: number, my: number) =>
    ({ transform: `translate(calc(var(--mx,0) * ${mx}px), calc(var(--my,0) * ${my}px))` } as React.CSSProperties);

  return (
    <div className="cp">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* mesh background */}
      <div className="cp-mesh">
        <div className="cp-blobw" style={{ ...par(-30, -20), top: -90, left: -60 }}>
          <div className="cp-blob" style={{ width: 460, height: 460, background: "#7C5CFC" }} />
        </div>
        <div className="cp-blobw" style={{ ...par(28, 18), top: 40, right: -80 }}>
          <div className="cp-blob" style={{ width: 420, height: 420, background: "#37C0F6", animationDelay: "2s" }} />
        </div>
        <div className="cp-blobw" style={{ ...par(18, -28), top: 420, left: "30%" }}>
          <div className="cp-blob" style={{ width: 380, height: 380, background: "#16B981", opacity: 0.4, animationDelay: "4s" }} />
        </div>
        <div className="cp-blobw" style={{ ...par(-22, 24), top: 260, right: "26%" }}>
          <div className="cp-blob" style={{ width: 300, height: 300, background: "#FFB020", opacity: 0.35, animationDelay: "1s" }} />
        </div>
      </div>

      {/* nav */}
      <nav className="cp-nav">
        <div className="cp-navin">
          <Logo />
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <a href="#features" className="cp-navlink cp-hidesm">Features</a>
            <a href="#how" className="cp-navlink cp-hidesm">How it works</a>
            <Link href="/login" className="cp-navlink">Log in</Link>
            <Link href="/login" className="cp-btn cp-primary">Get started</Link>
          </div>
        </div>
      </nav>

      {/* hero */}
      <header className="cp-wrap">
        <div className="cp-hero" ref={heroRef}>
          <div>
            <span className="cp-badge">⚡ AI calling CRM for real estate</span>
            <h1 className="cp-h1">
              Sell more plots with a team that <span className="cp-grad">never misses a lead</span>.
            </h1>
            <p className="cp-sub">
              Call Pro AI turns your Facebook &amp; walk-in leads into bookings — auto-dial your
              list, record and AI-summarise every call, get a ringing alert the second a hot lead
              lands, and track each plot from enquiry to token. Built for Indian real-estate
              sales teams.
            </p>
            <div className="cp-cta">
              <Link href="/login" className="cp-btn cp-primary">Get started free →</Link>
              <a href="#how" className="cp-btn cp-ghost">See how it works</a>
            </div>
            <div className="cp-trust">
              <span>✅ Works on any Android phone</span>
              <span>📞 Your SIM, your numbers</span>
              <span>🔒 No setup fees</span>
            </div>
          </div>

          {/* 3D phone + floating cards */}
          <div className="cp-stage">
            <div className="cp-parw" style={{ ...par(-26, -18), top: 22, left: -6 }}>
              <div className="cp-float">
                <span className="cp-fi" style={{ background: "linear-gradient(135deg,#FF7A66,#FFB020)" }}>🔥</span>
                <div>
                  <div>New hot lead</div>
                  <div style={{ color: "var(--muted)", fontWeight: 600, fontSize: 11 }}>Call now — tap to dial</div>
                </div>
              </div>
            </div>
            <div className="cp-parw" style={{ ...par(30, 22), bottom: 40, right: -8 }}>
              <div className="cp-float" style={{ animationDelay: "1.5s" }}>
                <span className="cp-fi" style={{ background: "linear-gradient(135deg,#16B981,#37C0F6)" }}>✅</span>
                <div>
                  <div>Booking confirmed</div>
                  <div style={{ color: "var(--mint)", fontWeight: 800, fontSize: 11 }}>Token ₹2,00,000</div>
                </div>
              </div>
            </div>
            <div className="cp-parw" style={{ ...par(20, -26), top: 150, right: -18 }}>
              <div className="cp-float" style={{ animationDelay: "0.8s" }}>
                <span className="cp-fi" style={{ background: "linear-gradient(135deg,#7C5CFC,#3B6EF6)" }}>📞</span>
                <div>118 calls today</div>
              </div>
            </div>

            <div className="cp-phone" ref={phoneRef}>
              <div className="cp-screen">
                <div className="cp-status"><span>9:41</span><span>📶 🔋</span></div>
                <div className="cp-apphead">
                  <div className="cp-appttl">Call Pro AI</div>
                  <div className="cp-appsub">Real estate sales, simplified</div>
                </div>
                <div className="cp-statcard">
                  <div style={{ fontSize: 11, opacity: 0.9, fontWeight: 700 }}>{"TODAY'S PIPELINE"}</div>
                  <div className="cp-statn">₹82,00,000</div>
                  <div style={{ fontSize: 11, opacity: 0.9 }}>7 hot · 2 site visits</div>
                </div>
                <div className="cp-leadcard">
                  <span className="cp-av" style={{ background: "linear-gradient(135deg,#7C5CFC,#3B6EF6)" }}>S</span>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 13 }}>Sachin Kumar</div>
                    <div style={{ color: "var(--muted)", fontSize: 11 }}>Site Visit · ₹12L</div>
                  </div>
                  <span className="cp-callpill">Call</span>
                </div>
                <div className="cp-leadcard">
                  <span className="cp-av" style={{ background: "linear-gradient(135deg,#16B981,#37C0F6)" }}>A</span>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 13 }}>Ankit Raj</div>
                    <div style={{ color: "var(--muted)", fontSize: 11 }}>New · Facebook lead</div>
                  </div>
                  <span className="cp-callpill">Call</span>
                </div>
                <div className="cp-leadcard">
                  <span className="cp-av" style={{ background: "linear-gradient(135deg,#FF7A66,#FFB020)" }}>P</span>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 13 }}>Prakash Mehta</div>
                    <div style={{ color: "var(--muted)", fontSize: 11 }}>Hot 🔥 · Negotiation</div>
                  </div>
                  <span className="cp-callpill">Call</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* marquee */}
      <div className="cp-marq">
        <div className="cp-marqrow">
          {[0, 1].map((k) => (
            <span key={k} style={{ display: "inline-flex", gap: 34 }}>
              Auto-dialer <b>•</b> Call recording <b>•</b> Hot-lead alerts <b>•</b> AI summaries <b>•</b>
              Follow-ups <b>•</b> Lead scoring <b>•</b> WhatsApp <b>•</b> Site visits <b>•</b> Bookings <b>•</b>&nbsp;
            </span>
          ))}
        </div>
      </div>

      {/* what is it */}
      <section className="cp-wrap cp-sec">
        <div className="cp-reveal" style={{ textAlign: "center", maxWidth: 720, margin: "0 auto" }}>
          <div className="cp-kick">What is Call Pro AI</div>
          <h2 className="cp-h2">Your whole sales floor, in one app.</h2>
          <p className="cp-leadp" style={{ margin: "0 auto" }}>
            Small builders run on Facebook ad leads and a team of telecallers — but leads go cold
            in minutes, reps forget callbacks, and owners can&apos;t see what&apos;s really happening.
            Call Pro AI fixes that with an Android app for your callers, a web dashboard for you,
            and an AI backend that captures, scores and keeps every call honest.
          </p>
        </div>
        <div className="cp-trio">
          {[
            ["📱", "linear-gradient(135deg,#7C5CFC,#3B6EF6)", "For your callers", "A dialer, CRM and follow-up planner in one — call all day without touching a spreadsheet."],
            ["🧑‍💼", "linear-gradient(135deg,#16B981,#37C0F6)", "For the owner", "Live dashboards, recordings, a leaderboard and revenue pipeline — know exactly what's happening."],
            ["🎯", "linear-gradient(135deg,#FF7A66,#FFB020)", "For every lead", "Captured in seconds, scored by AI, and chased with reminders until it books — nothing slips."],
          ].map(([ic, bg, t, b]) => (
            <div className="cp-card cp-reveal" key={t}>
              <div className="cp-cic" style={{ background: bg }}>{ic}</div>
              <h3>{t}</h3>
              <p>{b}</p>
            </div>
          ))}
        </div>
      </section>

      {/* features */}
      <section id="features" className="cp-wrap cp-sec" style={{ paddingTop: 0 }}>
        <div className="cp-reveal" style={{ textAlign: "center", maxWidth: 640, margin: "0 auto" }}>
          <div className="cp-kick">Features</div>
          <h2 className="cp-h2">Everything your team needs to close.</h2>
          <p className="cp-leadp" style={{ margin: "0 auto" }}>Replace the spreadsheet, the manual dialing, and the missed callbacks.</p>
        </div>
        <div className="cp-grid">
          {FEATURES.map(([ic, bg, t, b]) => (
            <div className="cp-card cp-reveal" key={t}>
              <div className="cp-cic" style={{ background: bg }}>{ic}</div>
              <h3>{t}</h3>
              <p>{b}</p>
            </div>
          ))}
        </div>
      </section>

      {/* how it works */}
      <section id="how" className="cp-wrap cp-sec" style={{ paddingTop: 0 }}>
        <div className="cp-reveal" style={{ textAlign: "center", maxWidth: 640, margin: "0 auto" }}>
          <div className="cp-kick">How it works</div>
          <h2 className="cp-h2">From lead to booking, on autopilot.</h2>
        </div>
        <div className="cp-steps">
          {[
            ["1", "Capture", "Auto-capture leads from Facebook ads, import a CSV, or add a walk-in — de-duplicated automatically."],
            ["2", "Call & qualify", "Auto-dial, record, and set the outcome + temperature in one screen. The funnel updates itself."],
            ["3", "Follow up", "Reminders with sound and auto-retry keep every callback on time — no lead forgotten."],
            ["4", "Close", "Track site visits to token and booking, and watch your pipeline value grow in real time."],
          ].map(([n, t, b]) => (
            <div className="cp-step cp-reveal" key={n}>
              <div className="cp-stepn">{n}</div>
              <h3>{t}</h3>
              <p>{b}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="cp-wrap cp-sec" style={{ paddingTop: 0 }}>
        <div className="cp-band cp-reveal">
          <h2>Ready to sell more plots?</h2>
          <p>Get your whole team calling smarter today. Set up in minutes — no setup fees.</p>
          <Link href="/login" className="cp-btn cp-bandbtn">Get started free →</Link>
        </div>
      </section>

      {/* footer */}
      <footer className="cp-wrap cp-foot">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
          <Logo />
          <div style={{ display: "flex", gap: 20, fontSize: 14 }}>
            <Link href="/login" className="cp-navlink">Log in</Link>
            <Link href="/privacy" className="cp-navlink">Privacy</Link>
          </div>
        </div>
        <p style={{ fontSize: 13, marginTop: 18 }}>© {new Date().getFullYear()} Call Pro AI · callproai.in · Real estate sales, simplified.</p>
      </footer>
    </div>
  );
}
