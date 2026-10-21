"use client";
// Call Pro AI telecaller app (/app): an installable web app for Chrome/Safari.
// Only browser-reliable features live here: calling via the phone's dialer
// (tel:), logging the outcome, follow-ups, notes, WhatsApp and Scan list. The
// auto-dialer, call recordings and call-log sync need the Android app, so this
// screen has no buttons for them at all.
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  type FollowUp, type Lead, type Profile, type Stage, type Today, type Lane,
  OUTCOMES, getProfile, laneOf, loadFollowUps, loadLeads, loadStages, loadToday, saveOutcome, updateNotes,
} from "@/lib/tele/data";
import { demoFollowUps, demoLeads, demoProfile, demoStages, demoToday } from "@/lib/tele/demo";
import { ScanTab } from "./ScanTab";

type View = "loading" | "entry" | "login" | "join" | "app";
type Tab = "home" | "leads" | "scan" | "follow";
type Pending = { contactId: string; startedAt: number; followUpId: string | null };

const GOALS = { calls: 50, connected: 30, visits: 3 };
const PENDING_KEY = "cpa.pendingCall";
const JOIN_KEY = "cpa.joinCode";
const IOS_HINT_KEY = "cpa.iosHintSeen";

export function TeleApp({ start, code }: { start?: "join"; code?: string }) {
  const [demo, setDemo] = useState(false);
  const [view, setView] = useState<View>("loading");
  const [tab, setTab] = useState<Tab>("home");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [follows, setFollows] = useState<FollowUp[]>([]);
  const [today, setToday] = useState<Today>({ calls: 0, connected: 0, visits: 0 });
  const [openLead, setOpenLead] = useState<string | null>(null);
  const [outcomeFor, setOutcomeFor] = useState<Pending | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [needsCode, setNeedsCode] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [scanStart, setScanStart] = useState<string | null>(null);

  const flash = (t: string) => { setToast(t); setTimeout(() => setToast(null), 2400); };

  const refresh = useCallback(async (p: Profile) => {
    const [l, s, f, t] = await Promise.all([loadLeads(p.id), loadStages(), loadFollowUps(p.id), loadToday(p.id)]);
    setLeads(l); setStages(s); setFollows(f); setToday(t);
  }, []);

  const enter = useCallback(async () => {
    const p = await getProfile();
    if (!p) { setView(start === "join" ? "join" : "entry"); return; }
    if (!p.company_id) {
      const saved = localStorage.getItem(JOIN_KEY) || code;
      if (saved) {
        const { error } = await createClient().rpc("join_company_by_code", { p_code: saved });
        if (!error) { localStorage.removeItem(JOIN_KEY); return enter(); }
      }
      setProfile(p); setNeedsCode(true); setView("app"); return;
    }
    setProfile(p); setNeedsCode(false); setView("app");
    await refresh(p);
  }, [code, refresh, start]);

  // Boot: demo mode (mock data, no network) or the real session.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("demo") === "1") {
      setDemo(true); setProfile(demoProfile); setLeads(demoLeads); setStages(demoStages);
      setFollows(demoFollowUps); setToday(demoToday);
      const sc = q.get("screen") ?? (start === "join" ? "join" : "home");
      if (sc === "entry" || sc === "login" || sc === "join") { setView(sc); return; }
      setView("app");
      if (sc === "leads") setTab("leads");
      if (sc === "follow") setTab("follow");
      if (sc === "scan" || sc === "scan-review") { setTab("scan"); if (sc === "scan-review") setScanStart("review"); }
      if (sc === "lead" || sc === "outcome") { setTab("leads"); setOpenLead("1"); }
      if (sc === "outcome") setOutcomeFor({ contactId: "1", startedAt: Date.now() - 60000, followUpId: "f1" });
      if (sc === "profile") setShowProfile(true);
      return;
    }
    enter().catch(() => setView("entry"));
  }, [enter, start]);

  // Back from the dialer → ask "What happened?".
  useEffect(() => {
    const check = () => {
      if (document.visibilityState !== "visible") return;
      const raw = sessionStorage.getItem(PENDING_KEY);
      if (!raw) return;
      const p = JSON.parse(raw) as Pending;
      if (Date.now() - p.startedAt < 2500) return;
      sessionStorage.removeItem(PENDING_KEY);
      setOutcomeFor(p);
    };
    document.addEventListener("visibilitychange", check);
    window.addEventListener("pageshow", check);
    window.addEventListener("focus", check);
    check();
    return () => {
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("pageshow", check);
      window.removeEventListener("focus", check);
    };
  }, []);

  const byId = useMemo(() => new Map(leads.map((l) => [l.id, l])), [leads]);
  const queue = useMemo(() => [
    ...leads.filter((l) => laneOf(l) === "call_now"),
    ...leads.filter((l) => laneOf(l) === "scheduled" && l.due_at && new Date(l.due_at).getTime() < Date.now() + 86400000),
  ], [leads]);

  function call(lead: Lead, followUpId: string | null = null) {
    const p: Pending = { contactId: lead.id, startedAt: Date.now(), followUpId };
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(p));
    window.location.href = `tel:${lead.phone}`;
  }

  if (view === "loading") return <div className="tele"><div className="tele-center"><div className="spinner" /></div></div>;
  if (view === "entry") return <Entry onTele={() => setView("login")} />;
  if (view === "login" || view === "join") {
    return <Auth mode={view} code={code ?? ""} demo={demo} onMode={setView} onDone={() => (demo ? setView("app") : enter())} />;
  }

  const lead = openLead ? byId.get(openLead) ?? null : null;
  const outcomeLead = outcomeFor ? byId.get(outcomeFor.contactId) ?? null : null;

  return (
    <div className="tele">
      <InstallHint />
      <main className="tele-main">
        {needsCode ? (
          <JoinCode code={code ?? ""} onJoined={() => enter()} />
        ) : tab === "home" ? (
          <Home profile={profile} today={today} queue={queue} follows={follows} byId={byId}
            onStart={() => queue[0] && setOpenLead(queue[0].id)} onOpen={setOpenLead}
            onProfile={() => setShowProfile(true)} onScan={() => setTab("scan")} />
        ) : tab === "leads" ? (
          <Leads leads={leads} onOpen={setOpenLead} onCall={call} onProfile={() => setShowProfile(true)} />
        ) : tab === "scan" ? (
          <ScanTab profile={profile} demo={demo} leads={leads} startAt={scanStart}
            onAdded={(n, taken) => {
              flash(`${n} lead${n === 1 ? "" : "s"} added${taken ? ` · ${taken} already with your team` : ""}`);
              if (profile && !demo) refresh(profile); setTab("leads");
            }} />
        ) : (
          <FollowUps follows={follows} byId={byId} onOpen={setOpenLead} onCall={call} />
        )}
      </main>

      {!needsCode && (
        <nav className="tabbar" aria-label="Main">
          {([["home", "Home", "M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"],
            ["leads", "Leads", "M16 11a4 4 0 1 0-8 0M4 21a8 8 0 0 1 16 0M12 3a4 4 0 1 1 0 8"],
            ["scan", "Scan", "M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10"],
            ["follow", "Follow Ups", "M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0"]] as [Tab, string, string][]).map(([t, label, d]) => (
            <button key={t} className={`tab ${tab === t ? "on" : ""} ${t === "scan" ? "tab-scan" : ""}`} onClick={() => { setTab(t); setOpenLead(null); }}>
              <svg viewBox="0 0 24 24" aria-hidden><path d={d} /></svg>
              <span>{label}</span>
            </button>
          ))}
        </nav>
      )}

      {lead && (
        <LeadDetail lead={lead} stages={stages} demo={demo}
          followUpId={follows.find((f) => f.contact_id === lead.id)?.id ?? null}
          onClose={() => setOpenLead(null)} onCall={call}
          onLog={(fid) => setOutcomeFor({ contactId: lead.id, startedAt: Date.now(), followUpId: fid })}
          onNotes={(n) => setLeads((ls) => ls.map((x) => (x.id === lead.id ? { ...x, notes: n } : x)))} />
      )}

      {outcomeFor && outcomeLead && (
        <OutcomeSheet lead={outcomeLead} stages={stages}
          onClose={() => setOutcomeFor(null)}
          onSave={async (o, note, when) => {
            if (!demo && profile) {
              await saveOutcome(profile, {
                lead: outcomeLead, outcome: o, note, startedAt: outcomeFor.startedAt, followUpId: outcomeFor.followUpId,
                stageLabel: stages.find((s) => s.code === o)?.label ?? OUTCOMES.find((x) => x.code === o)?.label ?? o,
                visitAt: o === "site_visit" ? when : null, callbackAt: o === "follow_up" ? when : null,
              });
              refresh(profile);
            }
            setOutcomeFor(null);
            flash("Saved");
            const next = queue.find((q) => q.id !== outcomeLead.id);
            setOpenLead(next ? next.id : null);
          }} />
      )}

      {showProfile && (
        <ProfileSheet profile={profile} demo={demo} onClose={() => setShowProfile(false)}
          onSignOut={async () => { if (!demo) await createClient().auth.signOut(); setShowProfile(false); setView("entry"); }} />
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

/* ---------- entry / auth ---------- */

function Entry({ onTele }: { onTele: () => void }) {
  return (
    <div className="tele tele-entry">
      <div className="entry-brand"><img src="/icons/icon-192.png" alt="" /><h1>Call Pro AI</h1><p>Who are you?</p></div>
      <a className="choice" href="/signup">
        <span className="choice-ic owner" aria-hidden>🏢</span>
        <span><b>I&apos;m a company owner</b><small>Create your free company account and add your team</small></span>
      </a>
      <button className="choice" onClick={onTele}>
        <span className="choice-ic tele-ic" aria-hidden>📞</span>
        <span><b>I&apos;m a telecaller</b><small>Log in, or join your team with a company code</small></span>
      </button>
      <p className="fine">Free. No credit card.</p>
    </div>
  );
}

function Auth({ mode, code, demo, onMode, onDone }: {
  mode: "login" | "join"; code: string; demo: boolean; onMode: (v: View) => void; onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [joinCode, setJoinCode] = useState(code);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (demo) return onDone();
    setBusy(true); setErr(null); setNotice(null);
    const sb = createClient();
    try {
      if (mode === "login") {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const c = joinCode.trim().toUpperCase();
        if (!c) throw new Error("Enter the company code your manager shared");
        localStorage.setItem(JOIN_KEY, c);
        const { data, error } = await sb.auth.signUp({ email, password,
          options: { data: { full_name: name, phone, role: "salesperson" } } });
        if (error) throw error;
        if (!data.session) { setNotice("Check your email to confirm, then log in here. We'll add you to your team."); onMode("login"); return; }
        const { error: jErr } = await sb.rpc("join_company_by_code", { p_code: c });
        if (jErr) throw new Error("That company code didn't work. Check it with your manager.");
        localStorage.removeItem(JOIN_KEY);
      }
      onDone();
    } catch (x: any) {
      setErr(x?.message ?? "Something went wrong");
    } finally { setBusy(false); }
  }

  return (
    <div className="tele tele-auth">
      <button className="back" onClick={() => onMode("entry")} aria-label="Back">‹ Back</button>
      <h1>{mode === "login" ? "Log in" : "Join your team"}</h1>
      <div className="tseg">
        <button className={mode === "login" ? "on" : ""} onClick={() => onMode("login")}>Log in</button>
        <button className={mode === "join" ? "on" : ""} onClick={() => onMode("join")}>Join with code</button>
      </div>
      <form onSubmit={submit} className="tcard form">
        {mode === "join" && (
          <>
            <label>Company code<input value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} placeholder="e.g. GV7K2P" autoCapitalize="characters" required /></label>
            <label>Your name<input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required /></label>
            <label>Mobile number<input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" /></label>
          </>
        )}
        <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></label>
        <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={6} required /></label>
        {err && <p className="err">{err}</p>}
        {notice && <p className="ok">{notice}</p>}
        <button className="tbtn primary" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Log in" : "Join team"}</button>
      </form>
      <p className="fine">{mode === "login" ? "New here? Ask your manager for the company code." : "Your manager finds the code in Team settings."}</p>
    </div>
  );
}

function JoinCode({ code, onJoined }: { code: string; onJoined: () => void }) {
  const [c, setC] = useState(code);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="pad">
      <h1 className="title">Join your team</h1>
      <form className="tcard form" onSubmit={async (e) => {
        e.preventDefault(); setErr(null);
        const { error } = await createClient().rpc("join_company_by_code", { p_code: c.trim().toUpperCase() });
        if (error) setErr("That code didn't work. Check it with your manager."); else onJoined();
      }}>
        <label>Company code<input value={c} onChange={(e) => setC(e.target.value.toUpperCase())} required /></label>
        {err && <p className="err">{err}</p>}
        <button className="tbtn primary">Join</button>
      </form>
    </div>
  );
}

/* ---------- Home ---------- */

function Ring({ value, goal, label, cls }: { value: number; goal: number; label: string; cls: string }) {
  const r = 34, c = 2 * Math.PI * r, f = Math.min(1, goal ? value / goal : 0);
  return (
    <div className="ring">
      <svg viewBox="0 0 80 80" aria-hidden>
        <circle className="ring-bg" cx="40" cy="40" r={r} />
        <circle className={`ring-fg ${cls}`} cx="40" cy="40" r={r} strokeDasharray={c} strokeDashoffset={c * (1 - f)} />
      </svg>
      <div className="ring-num"><b>{value}</b><small>/{goal}</small></div>
      <span className="ring-label">{label}</span>
    </div>
  );
}

function Home({ profile, today, queue, follows, byId, onStart, onOpen, onProfile, onScan }: {
  profile: Profile | null; today: Today; queue: Lead[]; follows: FollowUp[]; byId: Map<string, Lead>;
  onStart: () => void; onOpen: (id: string) => void; onProfile: () => void; onScan: () => void;
}) {
  const first = (profile?.full_name ?? "").split(" ")[0];
  const hr = new Date().getHours();
  const due = follows.filter((f) => new Date(f.due_at).getTime() < Date.now() + 86400000);
  return (
    <div className="pad">
      <header className="top">
        <div><small className="muted">{hr < 12 ? "Good morning" : hr < 17 ? "Good afternoon" : "Good evening"}</small><h1 className="title">{first || "Hi"}</h1></div>
        <button className="tavatar" onClick={onProfile} aria-label="Profile and settings">{(first[0] ?? "?").toUpperCase()}</button>
      </header>
      <section className="tcard rings">
        <Ring value={today.calls} goal={GOALS.calls} label="Calls" cls="c1" />
        <Ring value={today.connected} goal={GOALS.connected} label="Connected" cls="c2" />
        <Ring value={today.visits} goal={GOALS.visits} label="Site visits" cls="c3" />
      </section>
      <button className="tbtn primary big" onClick={onStart} disabled={!queue.length}>
        {queue.length ? `Start calling · ${queue.length} lead${queue.length === 1 ? "" : "s"}` : "No calls due — nice work"}
      </button>
      <h2 className="sec">Today&apos;s plan</h2>
      <div className="tcard list">
        {due.length === 0 && <p className="tempty">No follow-ups due today.</p>}
        {due.slice(0, 5).map((f) => (
          <button key={f.id} className="row" onClick={() => f.contact_id && onOpen(f.contact_id)}>
            <span className={`dot ${new Date(f.due_at).getTime() < Date.now() ? "late" : ""}`} />
            <span className="row-main"><b>{f.name || byId.get(f.contact_id ?? "")?.name || f.phone}</b><small>{f.note || "Follow up"}</small></span>
            <span className="row-meta">{fmtTime(f.due_at)}</span>
          </button>
        ))}
      </div>
      <button className="tcard scan-cta" onClick={onScan}>
        <b>Scan a lead list</b><small>Photo of a register, a screenshot or pasted WhatsApp text → leads in seconds</small>
      </button>
    </div>
  );
}

/* ---------- Leads ---------- */

const LANES: { id: Lane; label: string; explain: string }[] = [
  { id: "call_now", label: "Call now", explain: "Overdue and ready to call" },
  { id: "scheduled", label: "Scheduled", explain: "Due later today or booked ahead" },
  { id: "win_back", label: "Win back", explain: "Gone quiet or said no — worth one more try" },
];

function Leads({ leads, onOpen, onCall, onProfile }: {
  leads: Lead[]; onOpen: (id: string) => void; onCall: (l: Lead) => void; onProfile: () => void;
}) {
  const [lane, setLane] = useState<Lane>("call_now");
  const [q, setQ] = useState("");
  const counts = useMemo(() => {
    const c: Record<Lane, number> = { call_now: 0, scheduled: 0, win_back: 0 };
    leads.forEach((l) => { const x = laneOf(l); if (x) c[x]++; });
    return c;
  }, [leads]);
  const s = q.trim().toLowerCase();
  const shown = s
    ? leads.filter((l) => (l.name ?? "").toLowerCase().includes(s) || l.phone.includes(s.replace(/\D/g, "") || "\u0000"))
    : leads.filter((l) => laneOf(l) === lane);
  return (
    <div className="pad">
      <header className="top">
        <h1 className="title">Leads</h1>
        <button className="tavatar" onClick={onProfile} aria-label="Profile and settings">⚙︎</button>
      </header>
      <input className="search" type="search" placeholder="Search name or number" value={q} onChange={(e) => setQ(e.target.value)} />
      {!s && (
        <>
          <div className="tseg lanes">
            {LANES.map((l) => (
              <button key={l.id} className={lane === l.id ? "on" : ""} onClick={() => setLane(l.id)}>
                {l.label} <span className="count">{counts[l.id]}</span>
              </button>
            ))}
          </div>
          <p className="muted explain">{LANES.find((l) => l.id === lane)?.explain}</p>
        </>
      )}
      <div className="tcard list">
        {shown.length === 0 && <p className="tempty">{s ? "No match." : "Nothing here right now."}</p>}
        {shown.map((l) => (
          <div key={l.id} className="row">
            <button className="row-main tap" onClick={() => onOpen(l.id)}>
              <b>{l.name || l.phone}</b>
              <small>{label(l.status)}{l.due_at ? ` · ${fmtTime(l.due_at)}` : ""}</small>
            </button>
            <button className="callbtn" onClick={() => onCall(l)} aria-label={`Call ${l.name ?? l.phone}`}>
              <svg viewBox="0 0 24 24" aria-hidden><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" /></svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Lead detail ---------- */

function LeadDetail({ lead, stages, demo, followUpId, onClose, onCall, onLog, onNotes }: {
  lead: Lead; stages: Stage[]; demo: boolean; followUpId: string | null;
  onClose: () => void; onCall: (l: Lead, fid: string | null) => void; onLog: (fid: string | null) => void; onNotes: (n: string) => void;
}) {
  const [notes, setNotes] = useState(lead.notes ?? "");
  const [saved, setSaved] = useState(false);
  useEffect(() => { setNotes(lead.notes ?? ""); setSaved(false); }, [lead.id, lead.notes]);
  const steps = stages.filter((s) => s.rep_visible);
  const idx = steps.findIndex((s) => s.code === lead.status);
  const wa = `https://wa.me/91${lead.phone.replace(/\D/g, "").slice(-10)}`;
  return (
    <div className="sheet-full" role="dialog" aria-label={lead.name ?? lead.phone}>
      <header className="detail-top">
        <button className="back" onClick={onClose}>‹ Leads</button>
      </header>
      <div className="pad">
        <h1 className="title">{lead.name || lead.phone}</h1>
        <p className="muted">{lead.phone}{lead.company_name ? ` · ${lead.company_name}` : ""}</p>
        {steps.length > 0 && (
          <div className="stepper" aria-label={`Stage: ${label(lead.status)}`}>
            {steps.map((s, i) => (
              <div key={s.code} className={`step ${i < idx ? "done" : ""} ${i === idx ? "cur" : ""}`}>
                <span className="sdot" /><small>{s.label}</small>
              </div>
            ))}
          </div>
        )}
        {idx < 0 && <p className="pill">{label(lead.status)}</p>}
        <div className="actions">
          <button className="tbtn primary big" onClick={() => onCall(lead, followUpId)}>Call {lead.name?.split(" ")[0] ?? ""}</button>
          <a className="tbtn wa" href={wa} target="_blank" rel="noreferrer">WhatsApp</a>
        </div>
        <button className="link" onClick={() => onLog(followUpId)}>Already called? Log what happened</button>
        <h2 className="sec">Notes</h2>
        <div className="tcard form">
          <textarea rows={4} value={notes} placeholder="Budget, location, family, timeline…" onChange={(e) => { setNotes(e.target.value); setSaved(false); }} />
          <button className="tbtn" onClick={async () => { if (!demo) await updateNotes(lead.id, notes); onNotes(notes); setSaved(true); }}>
            {saved ? "Saved ✓" : "Save note"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Outcome sheet ---------- */

function OutcomeSheet({ lead, onClose, onSave }: {
  lead: Lead; stages: Stage[]; onClose: () => void; onSave: (o: string, note: string, when: Date | null) => Promise<void>;
}) {
  const [o, setO] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [when, setWhen] = useState(defaultWhen());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const needsWhen = o === "site_visit" || o === "follow_up";
  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label="What happened?" onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        <h2>What happened?</h2>
        <p className="muted">{lead.name || lead.phone}</p>
        <div className="outcomes">
          {OUTCOMES.map((x) => (
            <button key={x.code} className={`oc ${o === x.code ? "on" : ""}`} onClick={() => setO(x.code)}>{x.label}</button>
          ))}
        </div>
        {needsWhen && (
          <label className="when">{o === "site_visit" ? "Visit on" : "Call back on"}
            <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          </label>
        )}
        <textarea rows={2} placeholder="Add a note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        {err && <p className="err">{err}</p>}
        <button className="tbtn primary big" disabled={!o || busy} onClick={async () => {
          if (!o) return; setBusy(true); setErr(null);
          try { await onSave(o, note.trim(), needsWhen ? new Date(when) : null); }
          catch (x: any) { setErr(x?.message ?? "Couldn't save. Try again."); setBusy(false); }
        }}>{busy ? "Saving…" : "Save & next call"}</button>
      </div>
    </div>
  );
}

/* ---------- Follow Ups ---------- */

function FollowUps({ follows, byId, onOpen, onCall }: {
  follows: FollowUp[]; byId: Map<string, Lead>; onOpen: (id: string) => void; onCall: (l: Lead, fid: string | null) => void;
}) {
  const [chip, setChip] = useState<"all" | "overdue" | "today" | "upcoming">("all");
  const now = Date.now();
  const eod = new Date(); eod.setHours(23, 59, 59, 999);
  const group = (f: FollowUp) => { const t = new Date(f.due_at).getTime(); return t < now ? "overdue" : t <= eod.getTime() ? "today" : "upcoming"; };
  const groups = (["overdue", "today", "upcoming"] as const).filter((g) => chip === "all" || chip === g);
  return (
    <div className="pad">
      <header className="top"><h1 className="title">Follow Ups</h1></header>
      <div className="chips">
        {(["all", "overdue", "today", "upcoming"] as const).map((c) => (
          <button key={c} className={`tchip ${chip === c ? "on" : ""}`} onClick={() => setChip(c)}>
            {c[0].toUpperCase() + c.slice(1)} <span className="count">{c === "all" ? follows.length : follows.filter((f) => group(f) === c).length}</span>
          </button>
        ))}
      </div>
      {groups.map((g) => {
        const items = follows.filter((f) => group(f) === g);
        if (!items.length) return null;
        return (
          <section key={g}>
            <h2 className={`sec ${g === "overdue" ? "late" : ""}`}>{g[0].toUpperCase() + g.slice(1)}</h2>
            <div className="tcard list">
              {items.map((f) => {
                const l = f.contact_id ? byId.get(f.contact_id) : undefined;
                return (
                  <div key={f.id} className="row">
                    <button className="row-main tap" onClick={() => l && onOpen(l.id)}>
                      <b>{f.name || l?.name || f.phone}</b><small>{f.note || "Follow up"} · {fmtTime(f.due_at)}</small>
                    </button>
                    {l && <button className="callbtn" onClick={() => onCall(l, f.id)} aria-label="Call">
                      <svg viewBox="0 0 24 24" aria-hidden><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" /></svg>
                    </button>}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
      {follows.length === 0 && <p className="tempty">You&apos;re all caught up.</p>}
    </div>
  );
}

/* ---------- Profile / install ---------- */

type BIP = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let deferredPrompt: BIP | null = null;
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferredPrompt = e as BIP; });
}

function isIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent); }
function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true;
}

function ProfileSheet({ profile, demo, onClose, onSignOut }: { profile: Profile | null; demo: boolean; onClose: () => void; onSignOut: () => void }) {
  const [canInstall, setCanInstall] = useState(false);
  const [ios, setIos] = useState(false);
  useEffect(() => { setCanInstall(!!deferredPrompt && !isStandalone()); setIos(isIOS() && !isStandalone()); }, []);
  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label="Profile and settings" onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        <h2>{profile?.full_name || "You"}</h2>
        <p className="muted">Telecaller{demo ? " · demo" : ""}</p>
        <div className="tcard list">
          {canInstall && <button className="row" onClick={async () => { await deferredPrompt?.prompt(); deferredPrompt = null; setCanInstall(false); }}>
            <span className="row-main"><b>Install app</b><small>Add Call Pro AI to your home screen</small></span></button>}
          {ios && <div className="row"><span className="row-main"><b>Install on iPhone</b><small>Tap Share, then &ldquo;Add to Home Screen&rdquo;</small></span></div>}
          <button className="row" onClick={onSignOut}><span className="row-main"><b className="danger">Sign out</b></span></button>
        </div>
      </div>
    </div>
  );
}

function InstallHint() {
  const [show, setShow] = useState<"ios" | "android" | null>(null);
  useEffect(() => {
    if (isStandalone()) return;
    if (isIOS() && /safari/i.test(navigator.userAgent) && !localStorage.getItem(IOS_HINT_KEY)) setShow("ios");
    const onBip = () => setShow("android");
    if (deferredPrompt) setShow("android");
    window.addEventListener("beforeinstallprompt", onBip);
    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, []);
  if (!show) return null;
  const close = () => { localStorage.setItem(IOS_HINT_KEY, "1"); setShow(null); };
  return (
    <div className="install">
      {show === "ios" ? <span>Install: tap <b>Share</b> then <b>Add to Home Screen</b></span> : <span>Use Call Pro AI like an app</span>}
      {show === "android" && <button className="tbtn primary sm" onClick={async () => { await deferredPrompt?.prompt(); deferredPrompt = null; setShow(null); }}>Install</button>}
      <button className="x" onClick={close} aria-label="Dismiss">×</button>
    </div>
  );
}

/* ---------- helpers ---------- */

function label(code: string) {
  return OUTCOMES.find((o) => o.code === code)?.label ?? code.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}
function fmtTime(iso: string) {
  const d = new Date(iso), now = new Date();
  const t = d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return t;
  const tm = new Date(now); tm.setDate(now.getDate() + 1);
  if (d.toDateString() === tm.toDateString()) return `Tomorrow ${t}`;
  return `${d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} ${t}`;
}
function defaultWhen() {
  const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(11, 0, 0, 0);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
