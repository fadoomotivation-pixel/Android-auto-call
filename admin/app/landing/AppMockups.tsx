"use client";

/**
 * Pure-CSS recreations of the real Call Pro AI app screens, rendered inside a
 * phone frame. No images — everything is markup so it stays crisp at any size
 * and matches the app's premium UI. Used by the scroll-storytelling section.
 */

export function PhoneFrame({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`cp-phone ${className}`}>
      <div className="cp-phone-notch" />
      <div className="cp-screen">
        {/* fixed design size, scaled to the frame → identical premium layout
            at every phone size, no text wrapping / aspect issues */}
        <div className="cp-fit">{children}</div>
      </div>
    </div>
  );
}

function StatusBar({ title }: { title: string }) {
  return (
    <div className="cp-app-status">
      <span>9:41</span>
      <span className="cp-app-title">{title}</span>
      <span className="cp-app-sig">●●●</span>
    </div>
  );
}

/* 1 — Leads list */
export function ScreenLeads() {
  const leads = [
    { n: "Rahul Sharma", p: "+91 98765 43210", b: "₹45L · 2BHK", t: "hot", i: "RS" },
    { n: "Priya Mehta", p: "+91 99887 66554", b: "₹1.2Cr · Villa", t: "warm", i: "PM" },
    { n: "Anil Verma", p: "+91 90123 45678", b: "₹30L · Plot", t: "hot", i: "AV" },
    { n: "Sneha Patil", p: "+91 91234 56789", b: "₹65L · 3BHK", t: "cold", i: "SP" },
  ];
  return (
    <div className="cp-app cp-app-leads">
      <StatusBar title="Leads" />
      <div className="cp-app-body">
        <div className="cp-app-search">Search leads…</div>
        <div className="cp-app-chips">
          <span className="on">All</span>
          <span>New</span>
          <span>Hot</span>
          <span>Follow-up</span>
        </div>
        {leads.map((l, idx) => (
          <div className="cp-lead" key={l.n}>
            <div className={`cp-lead-av t-${l.t}`}>{l.i}</div>
            <div className="cp-lead-main">
              <div className="cp-lead-top">
                <span className="cp-lead-name">{l.n}</span>
                <span className={`cp-dot t-${l.t}`} />
              </div>
              <div className="cp-lead-sub">{l.p}</div>
              <div className="cp-lead-budget">{l.b}</div>
            </div>
            <div className="cp-lead-call" style={{ animationDelay: `${idx * 0.3}s` }}>
              📞
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* 2 — Incoming hot-lead alert */
export function ScreenAlert() {
  return (
    <div className="cp-app cp-app-alert">
      <div className="cp-alert-glow" />
      <div className="cp-alert-inner">
        <div className="cp-alert-badge">🔥 NEW HOT LEAD</div>
        <div className="cp-alert-timer">
          <span>00:08</span>
          <small>to first call</small>
        </div>
        <div className="cp-alert-name">Rahul Sharma</div>
        <div className="cp-alert-meta">Facebook Ad · 2BHK · ₹45L budget</div>
        <div className="cp-alert-tags">
          <span>Whitefield</span>
          <span>Ready to visit</span>
        </div>
        <button className="cp-alert-cta">📞 Call now</button>
        <div className="cp-alert-snooze">Assign to team</div>
      </div>
    </div>
  );
}

/* 3 — In-call + recording */
export function ScreenCall() {
  return (
    <div className="cp-app cp-app-call">
      <div className="cp-call-top">
        <span className="cp-rec">● REC</span>
        <span>Auto-dialer · 3 of 40</span>
      </div>
      <div className="cp-call-av">RS</div>
      <div className="cp-call-name">Rahul Sharma</div>
      <div className="cp-call-timer">02:14</div>
      <div className="cp-wave">
        {Array.from({ length: 28 }).map((_, i) => (
          <span
            key={i}
            style={{
              height: `${20 + Math.abs(Math.sin(i * 0.9)) * 60}%`,
              animationDelay: `${(i % 12) * 0.06}s`,
            }}
          />
        ))}
      </div>
      <div className="cp-call-actions">
        <div className="cp-call-btn">🔇</div>
        <div className="cp-call-btn end">📵</div>
        <div className="cp-call-btn">⏭️</div>
      </div>
      <div className="cp-call-hint">Next lead auto-dials when you hang up</div>
    </div>
  );
}

/* 4 — Pipeline / funnel */
export function ScreenPipeline() {
  const stages = [
    { s: "New", c: 128, w: 100, t: "warm" },
    { s: "Contacted", c: 86, w: 74, t: "warm" },
    { s: "Site visit", c: 41, w: 50, t: "hot" },
    { s: "Token paid", c: 18, w: 30, t: "hot" },
    { s: "Booked", c: 9, w: 18, t: "ok" },
  ];
  return (
    <div className="cp-app cp-app-pipe">
      <StatusBar title="Pipeline" />
      <div className="cp-app-body">
        <div className="cp-pipe-head">
          <div>
            <div className="cp-pipe-big">₹2.4 Cr</div>
            <div className="cp-pipe-small">live pipeline value</div>
          </div>
          <div className="cp-pipe-pill">This month</div>
        </div>
        {stages.map((st) => (
          <div className="cp-stage" key={st.s}>
            <div className="cp-stage-row">
              <span>{st.s}</span>
              <b>{st.c}</b>
            </div>
            <div className="cp-stage-bar">
              <span className={`t-${st.t}`} style={{ width: `${st.w}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* 5 — Owner dashboard */
export function ScreenDashboard() {
  const tiles = [
    { k: "Calls today", v: "342" },
    { k: "Leads worked", v: "118" },
    { k: "Site visits", v: "12" },
    { k: "Bookings", v: "4" },
  ];
  const team = [
    { n: "Amit", c: 96, b: 84 },
    { n: "Sana", c: 88, b: 72 },
    { n: "Vikram", c: 74, b: 60 },
  ];
  return (
    <div className="cp-app cp-app-dash">
      <StatusBar title="Owner Dashboard" />
      <div className="cp-app-body">
        <div className="cp-dash-tiles">
          {tiles.map((t) => (
            <div className="cp-dash-tile" key={t.k}>
              <div className="cp-dash-v">{t.v}</div>
              <div className="cp-dash-k">{t.k}</div>
            </div>
          ))}
        </div>
        <div className="cp-dash-card">
          <div className="cp-dash-card-title">Calls this week</div>
          <div className="cp-dash-chart">
            {[40, 65, 52, 78, 60, 88, 70].map((h, i) => (
              <span key={i} style={{ height: `${h}%` }} />
            ))}
          </div>
        </div>
        <div className="cp-dash-team">
          {team.map((m) => (
            <div className="cp-dash-member" key={m.n}>
              <span className="cp-dash-name">{m.n}</span>
              <div className="cp-dash-track">
                <span style={{ width: `${m.b}%` }} />
              </div>
              <span className="cp-dash-num">{m.c}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export const SCREENS = [
  ScreenLeads,
  ScreenAlert,
  ScreenCall,
  ScreenPipeline,
  ScreenDashboard,
];
