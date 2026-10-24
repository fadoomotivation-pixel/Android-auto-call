"use client";
// Call Pro AI telecaller app (/app): an installable web app for Chrome/Safari.
// Only browser-reliable features live here: calling via the phone's dialer
// (tel:), logging the outcome, follow-ups and their reminders (Web Push), notes,
// WhatsApp and Scan list. The auto-dialer, call recordings and call-log sync
// need the Android app, so this screen has no buttons for them at all.
//
// Which list a lead sits in is the DATABASE's answer (v_lead_workstate), the
// same one the Android app shows; lib/tele/work.ts only keeps the clock moving
// between refreshes. Every tab says in one line what is in it.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  type DayPlan, type FollowUp, type Lead, type Profile, type PushState, type Stage, type Today,
  OUTCOMES, afterSave, disableReminders, enableReminders, fmtWhen, getProfile, loadFollowUps, loadLeads,
  loadPlan, loadStages, loadToday, pushState, saveOutcome, sendDraft, updateNotes,
} from "@/lib/tele/data";
import {
  type Chip, type FuGroup, CHIPS, callQueue, callbackPicks, dueSignal, fuGroup, inChip, lateBy, visitPicks,
} from "@/lib/tele/work";
import { demoFollowUps, demoLeads, demoPlan, demoProfile, demoStages, demoToday } from "@/lib/tele/demo";
import { ScanTab } from "./ScanTab";

type View = "loading" | "entry" | "login" | "join" | "app";
type Tab = "home" | "leads" | "scan" | "follow";
type Pending = { contactId: string; startedAt: number; followUpId: string | null };

const GOALS = { calls: 50, connected: 30, visits: 3 };
const PENDING_KEY = "cpa.pendingCall";
const JOIN_KEY = "cpa.joinCode";
const IOS_HINT_KEY = "cpa.iosHintSeen";
const REFRESH_MS = 2 * 60_000;

/** One tick a minute, so a 3 PM callback is in Call now at 3 PM. */
function useNow(period = 60_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), period); return () => clearInterval(t); }, [period]);
  return now;
}

export function TeleApp({ start, code }: { start?: "join"; code?: string }) {
  const [demo, setDemo] = useState(false);
  const [view, setView] = useState<View>("loading");
  const [tab, setTab] = useState<Tab>("home");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [follows, setFollows] = useState<FollowUp[]>([]);
  const [today, setToday] = useState<Today>({ calls: 0, connected: 0, visits: 0 });
  const [plan, setPlan] = useState<DayPlan | null>(null);
  const [openLead, setOpenLead] = useState<string | null>(null);
  const [outcomeFor, setOutcomeFor] = useState<Pending | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [needsCode, setNeedsCode] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [scanStart, setScanStart] = useState<string | null>(null);
  const [push, setPush] = useState<PushState>("unsupported");
  const [dueAlert, setDueAlert] = useState<Lead | null>(null);
  const now = useNow();

  const flash = (t: string) => { setToast(t); setTimeout(() => setToast(null), 3200); };

  const refresh = useCallback(async (p: Profile) => {
    const [l, s, f, t, pl] = await Promise.all([loadLeads(p.id), loadStages(), loadFollowUps(p.id), loadToday(p.id), loadPlan(p.id)]);
    setLeads(l); setStages(s); setFollows(f); setToday(t);
    if (pl) setPlan(pl);
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
    pushState().then(setPush).catch(() => {});
  }, [code, refresh, start]);

  // A link from a reminder: /app?lead=<id> or /app?tab=follow.
  const openFromUrl = useCallback((href: string) => {
    const q = new URL(href, window.location.origin).searchParams;
    const lead = q.get("lead");
    if (lead) { setTab("leads"); setOpenLead(lead); }
    else if (q.get("tab") === "follow") { setTab("follow"); setOpenLead(null); }
  }, []);

  // Boot: demo mode (mock data, no network) or the real session.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("demo") === "1") {
      setDemo(true); setProfile(demoProfile); setLeads(demoLeads); setStages(demoStages);
      setFollows(demoFollowUps); setToday(demoToday); setPlan(demoPlan); setPush("off");
      const sc = q.get("screen") ?? (start === "join" ? "join" : "home");
      if (sc === "entry" || sc === "login" || sc === "join") { setView(sc); return; }
      setView("app");
      if (sc === "leads") setTab("leads");
      if (sc === "follow") setTab("follow");
      if (sc === "scan" || sc === "scan-review") { setTab("scan"); if (sc === "scan-review") setScanStart("review"); }
      if (sc === "lead" || sc === "outcome") { setTab("leads"); setOpenLead(sc === "outcome" ? "3" : "1"); }
      if (sc === "outcome") setOutcomeFor({ contactId: "3", startedAt: Date.now() - 60000, followUpId: "f5" });
      if (sc === "profile") setShowProfile(true);
      if (sc === "due") setDueAlert(demoLeads[2]);
      return;
    }
    enter().then(() => {
      if (q.get("lead") || q.get("tab")) { openFromUrl(window.location.href); window.history.replaceState(null, "", "/app"); }
    }).catch(() => setView("entry"));
  }, [enter, openFromUrl, start]);

  // Tapping a reminder while the app is already open (sw.js posts this).
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMsg = (e: MessageEvent) => { if (e.data?.type === "cpa-open") openFromUrl(e.data.url); };
    navigator.serviceWorker.addEventListener("message", onMsg);
    return () => navigator.serviceWorker.removeEventListener("message", onMsg);
  }, [openFromUrl]);

  // Fresh lists every two minutes and whenever the app comes back to the front.
  useEffect(() => {
    if (demo || !profile?.company_id) return;
    const go = () => { if (document.visibilityState === "visible") refresh(profile).catch(() => {}); };
    const t = setInterval(go, REFRESH_MS);
    document.addEventListener("visibilitychange", go);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", go); };
  }, [demo, profile, refresh]);

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

  // In-app reminder: a callback whose time arrives while the app is open gets a
  // banner — the push reaches the phone when it is closed.
  const lastTick = useRef(now);
  useEffect(() => {
    const from = lastTick.current;
    lastTick.current = now;
    if (from === now) return;
    const hit = leads.find((l) => l.due_at && Date.parse(l.due_at) > from && Date.parse(l.due_at) <= now);
    if (hit) setDueAlert(hit);
  }, [now, leads]);

  const byId = useMemo(() => new Map(leads.map((l) => [l.id, l])), [leads]);
  const noteByLead = useMemo(() => new Map(follows.filter((f) => f.contact_id).map((f) => [f.contact_id as string, f])), [follows]);
  const queue = useMemo(() => callQueue(leads, now), [leads, now]);
  const fuNow = useMemo(() => leads.filter((l) => fuGroup(l, now) === "now").length, [leads, now]);

  function call(lead: Lead, followUpId: string | null = null) {
    setDueAlert(null);
    const p: Pending = { contactId: lead.id, startedAt: Date.now(), followUpId: followUpId ?? noteByLead.get(lead.id)?.id ?? null };
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(p));
    window.location.href = `tel:${lead.phone}`;
  }

  /** A plan row: her own lead when it is in the list (so the outcome sheet
   *  follows the call), the bare number otherwise. */
  function callById(id: string, phone: string | null) {
    const l = byId.get(id);
    if (l) call(l);
    else if (phone) window.location.href = `tel:${phone}`;
  }

  async function approveDraft(id: string, body: string, phone: string | null) {
    if (demo) { flash("Sent from your WhatsApp"); return; }
    const r = await sendDraft(id, body);
    if (r.ok) {
      flash("Sent from your WhatsApp");
      setPlan((p) => p && { ...p, drafts: p.drafts.filter((d) => d.id !== id), counts: { ...p.counts, drafts: Math.max(0, p.counts.drafts - 1) } });
      return;
    }
    // Her WhatsApp is not linked: open WhatsApp with the message ready instead.
    flash(r.error ?? "Opening WhatsApp");
    const d = (phone ?? "").replace(/\D/g, "");
    if (d) window.open(`https://wa.me/${d.length === 10 ? `91${d}` : d}?text=${encodeURIComponent(body)}`, "_blank");
  }

  async function turnOnReminders() {
    if (demo) { setPush("on"); flash("Reminders on"); return; }
    try { const s = await enableReminders(); setPush(s); flash(s === "on" ? "Reminders on. Your phone will ring for callbacks." : "Reminders are off."); }
    catch (x: any) { flash(x?.message ?? "Couldn't turn on reminders."); }
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
      {dueAlert && (
        <div className="duebar" role="alert">
          <span><b>Callback due: {dueAlert.name || dueAlert.phone}</b><small>{noteByLead.get(dueAlert.id)?.note || "The time you booked is now"}</small></span>
          <button className="tbtn primary sm" onClick={() => call(dueAlert)}>Call</button>
          <button className="x" onClick={() => setDueAlert(null)} aria-label="Dismiss">×</button>
        </div>
      )}
      <main className="tele-main">
        {needsCode ? (
          <JoinCode code={code ?? ""} onJoined={() => enter()} />
        ) : tab === "home" ? (
          <Home profile={profile} today={today} queue={queue} plan={plan} now={now} push={push}
            onStart={() => queue[0] && setOpenLead(queue[0].id)} onOpen={(id) => byId.has(id) && setOpenLead(id)}
            onCall={callById} onApprove={approveDraft} onReminders={turnOnReminders}
            onProfile={() => setShowProfile(true)} onScan={() => setTab("scan")} onLeads={() => setTab("leads")} />
        ) : tab === "leads" ? (
          <Leads leads={leads} now={now} onOpen={setOpenLead} onCall={call} onProfile={() => setShowProfile(true)} />
        ) : tab === "scan" ? (
          <ScanTab profile={profile} demo={demo} leads={leads} startAt={scanStart}
            onAdded={(n, taken) => {
              flash(`${n} lead${n === 1 ? "" : "s"} added${taken ? ` · ${taken} already with your team` : ""}`);
              if (profile && !demo) refresh(profile); setTab("leads");
            }} />
        ) : (
          <FollowUps leads={leads} now={now} noteByLead={noteByLead} push={push} onReminders={turnOnReminders}
            onOpen={setOpenLead} onCall={call} />
        )}
      </main>

      {!needsCode && (
        <nav className="tabbar" aria-label="Main">
          {([["home", "Home", "M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z", 0],
            ["leads", "Leads", "M16 11a4 4 0 1 0-8 0M4 21a8 8 0 0 1 16 0M12 3a4 4 0 1 1 0 8", 0],
            ["scan", "Scan", "M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10", 0],
            ["follow", "Follow Ups", "M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0", fuNow]] as [Tab, string, string, number][]).map(([t, label, d, badge]) => (
            <button key={t} className={`tab ${tab === t ? "on" : ""}`} onClick={() => { setTab(t); setOpenLead(null); }}
              aria-label={badge ? `${label}, ${badge} to call now` : label}>
              <span className="tab-ic">
                <svg viewBox="0 0 24 24" aria-hidden><path d={d} /></svg>
                {badge > 0 && <span className="badge">{badge > 99 ? "99+" : badge}</span>}
              </span>
              <span>{label}</span>
            </button>
          ))}
        </nav>
      )}

      {lead && (
        <LeadDetail lead={lead} stages={stages} demo={demo} now={now} followUp={noteByLead.get(lead.id) ?? null}
          onClose={() => setOpenLead(null)} onCall={call}
          onLog={(fid) => setOutcomeFor({ contactId: lead.id, startedAt: Date.now(), followUpId: fid })}
          onNotes={(n) => setLeads((ls) => ls.map((x) => (x.id === lead.id ? { ...x, notes: n } : x)))} />
      )}

      {outcomeFor && outcomeLead && (
        <OutcomeSheet lead={outcomeLead}
          onClose={() => setOutcomeFor(null)}
          onSave={async (o, note, when) => {
            if (!demo && profile) {
              await saveOutcome(profile, {
                lead: outcomeLead, outcome: o, note, startedAt: outcomeFor.startedAt, followUpId: outcomeFor.followUpId,
                stageLabel: stages.find((s) => s.code === o)?.label ?? OUTCOMES.find((x) => x.code === o)?.label ?? o,
                visitAt: o === "site_visit" ? when : null, callbackAt: o === "follow_up" || o === "interested" ? when : null,
              });
              refresh(profile).catch(() => {});
            }
            setOutcomeFor(null);
            flash(`Saved. ${afterSave(o, outcomeLead, when)}`);
            const next = queue.find((q) => q.id !== outcomeLead.id);
            setOpenLead(next ? next.id : null);
          }} />
      )}

      {showProfile && (
        <ProfileSheet profile={profile} demo={demo} push={push} onReminders={turnOnReminders} onClose={() => setShowProfile(false)}
          onSignOut={async () => {
            if (!demo) { await disableReminders(); await createClient().auth.signOut(); }
            setShowProfile(false); setView("entry");
          }} />
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

function Home({ profile, today, queue, plan, now, push, onStart, onOpen, onCall, onApprove, onReminders, onProfile, onScan, onLeads }: {
  profile: Profile | null; today: Today; queue: Lead[]; plan: DayPlan | null; now: number; push: PushState;
  onStart: () => void; onOpen: (id: string) => void; onCall: (id: string, phone: string | null) => void;
  onApprove: (id: string, body: string, phone: string | null) => Promise<void>;
  onReminders: () => void; onProfile: () => void; onScan: () => void; onLeads: () => void;
}) {
  const first = (profile?.full_name ?? "").split(" ")[0];
  const hr = new Date(now).getHours();
  return (
    <div className="pad">
      <header className="top">
        <div><small className="muted">{hr < 12 ? "Good morning" : hr < 17 ? "Good afternoon" : "Good evening"}</small><h1 className="title">{first || "Hi"}</h1></div>
        <button className="tavatar" onClick={onProfile} aria-label="Profile and settings">{(first[0] ?? "?").toUpperCase()}</button>
      </header>

      <section className="tcard hero">
        <div className="hero-top">
          <div><small className="muted">Call now</small><b className="hero-num">{queue.length}</b></div>
          <p className="muted">{queue.length ? "Buyers who wrote first, then what you promised, then the rest. Same order as your phone app." : "Nobody to call right now."}</p>
        </div>
        <button className="tbtn primary big" onClick={onStart} disabled={!queue.length}>
          {queue.length ? `Start calling · ${queue[0].name?.split(" ")[0] || queue[0].phone} first` : "All done for now"}
        </button>
      </section>

      <Reminders push={push} onTurnOn={onReminders} />

      <section className="tcard rings">
        <Ring value={today.calls} goal={GOALS.calls} label="Calls" cls="c1" />
        <Ring value={today.connected} goal={GOALS.connected} label="Connected" cls="c2" />
        <Ring value={today.visits} goal={GOALS.visits} label="Site visits" cls="c3" />
      </section>

      <h2 className="sec">Today&apos;s Plan</h2>
      <p className="muted explain">The same lists as your phone app and your evening WhatsApp.</p>

      {/* A buyer wrote and nobody answered. They acted first, so they are first. */}
      {plan && plan.waiting.length > 0 && (
        <PlanList title={PLAN.waiting} explain="They wrote to you on WhatsApp. Nobody has answered yet." count={plan.counts.waiting}
          rows={plan.waiting.map((w) => ({ id: w.contact_id, name: w.name, phone: w.phone, late: true,
            meta: waitedLabel(w.minutes), detail: w.text ? `"${w.text}"` : w.media ? `Sent a ${w.media}` : "Wrote to you" }))}
          onOpen={onOpen} onCall={onCall} />
      )}

      <PlanList title="Call now" explain="Who to ring, in the same order as your phone app." count={queue.length}
        rows={queue.map((l) => ({ id: l.id, name: l.name, phone: l.phone, late: !!(l.due_at && Date.parse(l.due_at) <= now),
          meta: l.due_at ? fmtTime(l.due_at) : "Due now", detail: dueSignal(l, now) ?? label(l.status) }))}
        onOpen={onOpen} onCall={onCall} onAll={onLeads} empty="Nobody to call right now. Booked callbacks come here on their own." />

      {plan && plan.promises.length > 0 && (
        <PlanList title={PLAN.promises} explain="Things you said on a recorded call that you would do. Do them, and they leave this list on their own."
          count={plan.counts.promise_people}
          rows={plan.promises.map((p) => ({ id: p.contact_id, name: p.name, phone: p.phone, late: p.late,
            meta: p.oldest_days <= 0 ? "Today" : `${p.oldest_days}d`,
            detail: [...new Set(p.items.map((i) => i.promise))].join(" + ") }))}
          onOpen={onOpen} onCall={onCall} />
      )}

      {plan && plan.drafts.length > 0 && <Drafts drafts={plan.drafts} onApprove={onApprove} />}

      {plan && plan.visits.length > 0 && (
        <PlanList title={PLAN.visits} explain="Site visits for the rest of today and tomorrow. Call in the morning to confirm." count={plan.counts.visits}
          rows={plan.visits.map((v) => ({ id: v.contact_id, name: v.name, phone: v.phone, late: false,
            meta: fmtTime(v.at), detail: v.project ?? "Confirm the time" }))}
          onOpen={onOpen} onCall={onCall} />
      )}

      {plan && plan.counts.visits_pending > 0 && (
        <p className="muted explain">{plan.counts.visits_pending} site visit{plan.counts.visits_pending === 1 ? " has" : "s have"} no outcome yet.
          Answer &ldquo;Did they come?&rdquo; on Home in your phone app.</p>
      )}

      <button className="tcard scan-cta" onClick={onScan}>
        <b>Scan a lead list</b><small>Photo of a register, a screenshot or pasted WhatsApp text → leads in seconds</small>
      </button>
    </div>
  );
}

/** The names her WhatsApp and the phone app use for the same lists. */
const PLAN = { waiting: "Waiting for your reply", promises: "You said you would", visits: "Site visit fixed", drafts: "WhatsApp ready" };

type PlanRowData = { id: string; name: string | null; phone: string | null; late: boolean; meta: string; detail: string };

/** "3h" — how long a buyer has waited. Same as the phone app. */
function waitedLabel(m: number) {
  return m < 60 ? `${Math.max(1, m)}m` : m < 1440 ? `${Math.floor(m / 60)}h` : `${Math.floor(m / 1440)}d`;
}

/** One Today's Plan list: three rows, then "See all N" — never a bare "+N more". */
function PlanList({ title, explain, count, rows, onOpen, onCall, onAll, empty }: {
  title: string; explain: string; count: number; rows: PlanRowData[];
  onOpen: (id: string) => void; onCall: (id: string, phone: string | null) => void; onAll?: () => void; empty?: string;
}) {
  const [all, setAll] = useState(false);
  if (!rows.length && !empty) return null;
  const shown = all ? rows : rows.slice(0, 3);
  return (
    <section>
      <h3 className="sec">{title} · {count}</h3>
      <p className="muted explain">{explain}</p>
      <div className="tcard list">
        {!rows.length && <p className="tempty">{empty}</p>}
        {shown.map((r) => (
          <div key={r.id} className="row">
            <button className="row-main tap" onClick={() => onOpen(r.id)}>
              <b>{r.name || r.phone}</b>
              <small>{r.detail}</small>
            </button>
            <span className={`row-meta ${r.late ? "late" : ""}`}>{r.meta}</span>
            {r.phone && (
              <button className="callbtn" onClick={() => onCall(r.id, r.phone)} aria-label={`Call ${r.name ?? r.phone}`}>
                <svg viewBox="0 0 24 24" aria-hidden><path d={PHONE} /></svg>
              </button>
            )}
          </div>
        ))}
        {count > 3 && !all && (
          <button className="row more" onClick={() => (onAll ? onAll() : setAll(true))}>See all {count}</button>
        )}
      </div>
    </section>
  );
}

/** The WhatsApps the end of a call already wrote. Check, change, Approve & send
 *  — from her own linked WhatsApp, the same as the phone app. */
function Drafts({ drafts, onApprove }: {
  drafts: DayPlan["drafts"]; onApprove: (id: string, body: string, phone: string | null) => Promise<void>;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <section>
      <h3 className="sec">{PLAN.drafts} · {drafts.length}</h3>
      <p className="muted explain">Your last calls already wrote these. Check the words, change them if you like, then send.</p>
      <div className="tcard list">
        {drafts.map((d) => (
          <div key={d.id}>
            <button className="row tap" onClick={() => { setOpen(open === d.id ? null : d.id); setText(d.body); }} aria-expanded={open === d.id}>
              <span className="row-main"><b>{d.name || d.phone}</b><small>{d.body}</small></span>
              <span className="row-meta">{open === d.id ? "Close" : "Check"}</span>
            </button>
            {open === d.id && (
              <div className="pad">
                <textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} aria-label={`Message to ${d.name ?? d.phone}`} />
                <button className="tbtn wa big" disabled={busy || !text.trim()}
                  onClick={async () => { setBusy(true); await onApprove(d.id, text.trim(), d.phone); setBusy(false); setOpen(null); }}>
                  {busy ? "Sending…" : "Approve & send"}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

/** Turn on reminders: said once, in plain words, where the rep already looks. */
function Reminders({ push, onTurnOn }: { push: PushState; onTurnOn: () => void }) {
  if (push === "on" || push === "unsupported") return null;
  return (
    <section className="tcard remind">
      <span className="remind-ic" aria-hidden>🔔</span>
      <span className="row-main">
        <b>{push === "blocked" ? "Reminders are blocked" : "Callback reminders"}</b>
        <small>{push === "install-first" ? "On iPhone: tap Share, then “Add to Home Screen”. Open the app from there and turn reminders on."
          : push === "blocked" ? "Allow notifications for callproai.in in your browser settings."
          : "Your phone rings at the time you booked, even when this app is closed."}</small>
      </span>
      {push === "off" && <button className="tbtn primary sm" onClick={onTurnOn}>Turn on</button>}
    </section>
  );
}

/* ---------- Leads ---------- */

function Leads({ leads, now, onOpen, onCall, onProfile }: {
  leads: Lead[]; now: number; onOpen: (id: string) => void; onCall: (l: Lead) => void; onProfile: () => void;
}) {
  const [chip, setChip] = useState<Chip>("call_now");
  const [q, setQ] = useState("");
  const counts = useMemo(() => Object.fromEntries(CHIPS.map((c) => [c.id, leads.filter((l) => inChip(l, c.id, now)).length])) as Record<Chip, number>, [leads, now]);
  const s = q.trim().toLowerCase();
  const digits = s.replace(/\D/g, "");
  const shown = s
    ? leads.filter((l) => (l.name ?? "").toLowerCase().includes(s) || (digits.length >= 3 && l.phone.replace(/\D/g, "").includes(digits)))
    : chip === "call_now" ? callQueue(leads, now) : leads.filter((l) => inChip(l, chip, now));
  return (
    <div className="pad">
      <header className="top">
        <h1 className="title">Leads</h1>
        <button className="tavatar" onClick={onProfile} aria-label="Profile and settings">⚙︎</button>
      </header>
      <input className="search" type="search" placeholder="Search name or number" value={q} onChange={(e) => setQ(e.target.value)} />
      {!s && (
        <>
          <div className="chips" role="tablist">
            {CHIPS.map((c) => (
              <button key={c.id} role="tab" aria-selected={chip === c.id} className={`tchip ${chip === c.id ? "on" : ""} ${c.id === "overdue" && counts.overdue ? "warn" : ""}`}
                onClick={() => setChip(c.id)}>
                {c.label} <span className="count">{counts[c.id]}</span>
              </button>
            ))}
          </div>
          <p className="muted explain">{CHIPS.find((c) => c.id === chip)?.explain}</p>
        </>
      )}
      <div className="tcard list">
        {shown.length === 0 && <p className="tempty">{s ? "No match." : chip === "call_now" ? "Nobody to call right now. Booked callbacks come here on their own, at their time." : "Nothing here right now."}</p>}
        {shown.slice(0, 300).map((l) => {
          const late = l.due_at && Date.parse(l.due_at) <= now ? lateBy(l.due_at, now) : null;
          return (
            <div key={l.id} className="row">
              <button className="row-main tap" onClick={() => onOpen(l.id)}>
                <b>{l.name || l.phone}</b>
                <small>{label(l.status)}{l.due_at ? ` · ${fmtTime(l.due_at)}` : ""}{late ? <span className="late"> · {late}</span> : null}</small>
              </button>
              <button className="callbtn" onClick={() => onCall(l)} aria-label={`Call ${l.name ?? l.phone}`}>
                <svg viewBox="0 0 24 24" aria-hidden><path d={PHONE} /></svg>
              </button>
            </div>
          );
        })}
      </div>
      {shown.length > 300 && <p className="fine">Showing 300 of {shown.length}. Search to find the rest.</p>}
    </div>
  );
}

/* ---------- Lead detail ---------- */

function LeadDetail({ lead, stages, demo, now, followUp, onClose, onCall, onLog, onNotes }: {
  lead: Lead; stages: Stage[]; demo: boolean; now: number; followUp: FollowUp | null;
  onClose: () => void; onCall: (l: Lead, fid: string | null) => void; onLog: (fid: string | null) => void; onNotes: (n: string) => void;
}) {
  const [notes, setNotes] = useState(lead.notes ?? "");
  const [saved, setSaved] = useState<"" | "saving" | "saved" | "error">("");
  useEffect(() => { setNotes(lead.notes ?? ""); setSaved(""); }, [lead.id, lead.notes]);
  const steps = stages.filter((s) => s.rep_visible);
  const idx = steps.findIndex((s) => s.code === (lead.stage ?? lead.status));
  const wa = `https://wa.me/91${lead.phone.replace(/\D/g, "").slice(-10)}`;
  const due = lead.due_at ? Date.parse(lead.due_at) : null;
  const late = due !== null && due <= now ? lateBy(lead.due_at!, now) : null;
  const fid = followUp?.id ?? null;
  return (
    <div className="sheet-full" role="dialog" aria-label={lead.name ?? lead.phone}>
      <header className="detail-top">
        <button className="back" onClick={onClose}>‹ Back</button>
      </header>
      <div className="pad">
        <h1 className="title">{lead.name || lead.phone}</h1>
        <p className="muted">{lead.phone}{lead.company_name ? ` · ${lead.company_name}` : ""}</p>
        {due !== null && (
          <div className={`nextcall ${due <= now ? "now" : ""}`}>
            <b>{due <= now ? `Call now${late ? ` · ${late}` : ""}` : `Next call ${fmtWhen(new Date(due), new Date(now))}`}</b>
            {followUp?.note && <small>{followUp.note}</small>}
          </div>
        )}
        {steps.length > 0 && idx >= 0 && (
          <div className="stepper" aria-label={`Stage: ${steps[idx].label}`}>
            {steps.map((s, i) => (
              <div key={s.code} className={`step ${i < idx ? "done" : ""} ${i === idx ? "cur" : ""}`}>
                <span className="sdot" /><small>{s.label}</small>
              </div>
            ))}
          </div>
        )}
        {idx < 0 && <p className="pill">{label(lead.status)}</p>}
        <div className="actions">
          <button className="tbtn primary big" onClick={() => onCall(lead, fid)}>Call {lead.name?.split(" ")[0] ?? ""}</button>
          <a className="tbtn wa" href={wa} target="_blank" rel="noreferrer">WhatsApp</a>
        </div>
        <button className="link" onClick={() => onLog(fid)}>Already called? Save what happened</button>
        <h2 className="sec">Notes</h2>
        <div className="tcard form">
          <textarea rows={4} value={notes} placeholder="Budget, location, family, timeline…" onChange={(e) => { setNotes(e.target.value); setSaved(""); }} />
          <button className="tbtn" disabled={saved === "saving"} onClick={async () => {
            setSaved("saving");
            try { if (!demo) await updateNotes(lead.id, notes); onNotes(notes); setSaved("saved"); } catch { setSaved("error"); }
          }}>
            {saved === "saved" ? "Saved ✓" : saved === "saving" ? "Saving…" : "Save note"}
          </button>
          {saved === "error" && <p className="err">Couldn&apos;t save the note. Check your signal and try again.</p>}
        </div>
      </div>
    </div>
  );
}

/* ---------- Outcome sheet ---------- */

function OutcomeSheet({ lead, onClose, onSave }: {
  lead: Lead; onClose: () => void; onSave: (o: string, note: string, when: Date | null) => Promise<void>;
}) {
  const [o, setO] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [when, setWhen] = useState<Date | null>(null);
  const [custom, setCustom] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const needsWhen = o === "site_visit" || o === "follow_up" || o === "interested";
  const picks = o === "site_visit" ? visitPicks() : callbackPicks();
  const pick = (code: string) => { setO(code); setWhen(null); setCustom(false); setErr(null); };
  const after = o ? afterSave(o, lead, when) : "";
  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label="What happened?" onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        <h2>What happened?</h2>
        <p className="muted">{lead.name || lead.phone}</p>
        <div className="outcomes">
          {OUTCOMES.map((x) => (
            <button key={x.code} className={`oc ${o === x.code ? "on" : ""}`} onClick={() => pick(x.code)}>{x.label}</button>
          ))}
        </div>
        {needsWhen && (
          <div className="when">
            <b>{o === "site_visit" ? "When is the site visit?" : "When will you call again?"}</b>
            <div className="picks">
              {picks.map((p) => (
                <button key={p.label} className={`tchip ${!custom && when?.getTime() === p.at.getTime() ? "on" : ""}`}
                  onClick={() => { setWhen(p.at); setCustom(false); }}>{p.label}</button>
              ))}
              <button className={`tchip ${custom ? "on" : ""}`} onClick={() => { setCustom(true); setWhen(null); }}>Pick date &amp; time</button>
            </div>
            {custom && <input type="datetime-local" onChange={(e) => setWhen(e.target.value ? new Date(e.target.value) : null)} />}
          </div>
        )}
        {after && <p className="after">→ {after}</p>}
        <textarea rows={2} placeholder="Add a note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        {err && <p className="err">{err}</p>}
        <button className="tbtn primary big" disabled={!o || busy || (needsWhen && !when)} onClick={async () => {
          if (!o) return;
          if (needsWhen && when && when.getTime() < Date.now() - 60000) { setErr("That time has already passed. Pick a later one."); return; }
          setBusy(true); setErr(null);
          try { await onSave(o, note.trim(), needsWhen ? when : null); }
          catch (x: any) { setErr(x?.message ?? "Couldn't save. Try again."); setBusy(false); }
        }}>{busy ? "Saving…" : !o ? "Pick what happened" : needsWhen && !when ? "Pick a time" : "Save & next call"}</button>
      </div>
    </div>
  );
}

/* ---------- Follow Ups ---------- */

const FU_HEAD: Record<FuGroup, { title: string; explain: string }> = {
  now: { title: "Call now", explain: "Their time has come. Oldest first." },
  done: { title: "Done today", explain: "You updated these today. Their next call is booked." },
  later: { title: "Booked for later", explain: "They move to Call now on their own, at their time." },
};

function FuRow({ lead, now, note, onOpen, onCall }: {
  lead: Lead; now: number; note?: string | null; onOpen: (id: string) => void; onCall?: (l: Lead) => void;
}) {
  const due = lead.due_at ? Date.parse(lead.due_at) : null;
  const late = due !== null && due <= now ? lateBy(lead.due_at!, now) : null;
  return (
    <div className="row">
      <span className={`dot ${late ? "late" : due !== null && due <= now ? "now" : ""}`} />
      <button className="row-main tap" onClick={() => onOpen(lead.id)}>
        <b>{lead.name || lead.phone}</b>
        <small>{note || label(lead.status)}</small>
      </button>
      <span className={`row-meta ${late ? "late" : ""}`}>{late ?? (lead.due_at ? fmtTime(lead.due_at) : "No time set")}</span>
      {onCall && <button className="callbtn" onClick={() => onCall(lead)} aria-label={`Call ${lead.name ?? lead.phone}`}>
        <svg viewBox="0 0 24 24" aria-hidden><path d={PHONE} /></svg>
      </button>}
    </div>
  );
}

function FollowUps({ leads, now, noteByLead, push, onReminders, onOpen, onCall }: {
  leads: Lead[]; now: number; noteByLead: Map<string, FollowUp>; push: PushState; onReminders: () => void;
  onOpen: (id: string) => void; onCall: (l: Lead) => void;
}) {
  const [open, setOpen] = useState<Record<FuGroup, boolean>>({ now: true, done: false, later: false });
  const groups = useMemo(() => {
    const g: Record<FuGroup, Lead[]> = { now: [], done: [], later: [] };
    leads.forEach((l) => { const x = fuGroup(l, now); if (x) g[x].push(l); });
    const t = (l: Lead) => (l.due_at ? Date.parse(l.due_at) : 0);
    (Object.keys(g) as FuGroup[]).forEach((k) => g[k].sort((a, b) => t(a) - t(b)));
    return g;
  }, [leads, now]);
  return (
    <div className="pad">
      <header className="top"><h1 className="title">Follow Ups</h1></header>
      <p className="muted explain">Callbacks you booked. Ring the first group. The others come up on their own, at their time.</p>
      <Reminders push={push} onTurnOn={onReminders} />
      {(["now", "done", "later"] as FuGroup[]).map((k) => {
        const items = groups[k];
        if (k === "now" && !items.length) {
          return (
            <section key={k} className="tcard allclear">
              <b>All follow-ups done</b>
              <small>{groups.later.length ? `No call is due right now. ${groups.later.length} are booked for later — they show up here on their own, at their time.`
                : "No call is due right now. Nothing is booked for later either."}</small>
            </section>
          );
        }
        if (!items.length) return null;
        return (
          <section key={k}>
            <button className={`sec fuhead ${k === "now" ? "late" : ""}`} aria-expanded={open[k]} onClick={() => setOpen({ ...open, [k]: !open[k] })}>
              <span>{FU_HEAD[k].title} · {items.length}</span><span className="chev">{open[k] ? "Hide" : "Show"}</span>
            </button>
            {open[k] && (
              <>
                <p className="muted explain">{FU_HEAD[k].explain}</p>
                <div className="tcard list">
                  {items.map((l) => <FuRow key={l.id} lead={l} now={now} note={noteByLead.get(l.id)?.note} onOpen={onOpen} onCall={onCall} />)}
                </div>
              </>
            )}
          </section>
        );
      })}
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

function ProfileSheet({ profile, demo, push, onReminders, onClose, onSignOut }: {
  profile: Profile | null; demo: boolean; push: PushState; onReminders: () => void; onClose: () => void; onSignOut: () => void;
}) {
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
          {push !== "unsupported" && (
            <button className="row" onClick={push === "off" ? onReminders : undefined}>
              <span className="row-main"><b>Callback reminders</b>
                <small>{push === "on" ? "On. Your phone rings at the time you booked." : push === "blocked" ? "Blocked in browser settings" : push === "install-first" ? "Add to Home Screen first" : "Off. Tap to turn on."}</small></span>
              <span className={`row-meta ${push === "on" ? "ok" : ""}`}>{push === "on" ? "On" : "Off"}</span>
            </button>
          )}
          {canInstall && <button className="row" onClick={async () => { await deferredPrompt?.prompt(); deferredPrompt = null; setCanInstall(false); }}>
            <span className="row-main"><b>Install app</b><small>Add Call Pro AI to your home screen</small></span></button>}
          {ios && <div className="row"><span className="row-main"><b>Install on iPhone</b><small>Tap Share, then &ldquo;Add to Home Screen&rdquo;</small></span></div>}
          <button className="row" onClick={onSignOut}><span className="row-main"><b className="danger">Sign out</b><small>This phone stops getting your reminders</small></span></button>
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

const PHONE = "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2";

function label(code: string) {
  return OUTCOMES.find((o) => o.code === code)?.label ?? code.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}
function fmtTime(iso: string) {
  const d = new Date(iso), now = new Date();
  const t = d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return t;
  const tm = new Date(now); tm.setDate(now.getDate() + 1);
  if (d.toDateString() === tm.toDateString()) return `Tomorrow ${t}`;
  const ys = new Date(now); ys.setDate(now.getDate() - 1);
  if (d.toDateString() === ys.toDateString()) return `Yesterday ${t}`;
  return `${d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} ${t}`;
}
