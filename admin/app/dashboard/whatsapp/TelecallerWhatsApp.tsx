"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Rep = { id: string; full_name: string | null };

type Session = {
  salesperson_id: string;
  base_url: string | null;
  status: string;
  wa_number: string | null;
  last_seen_at: string | null;
  /** When the connection itself was last confirmed up. See healthOf. */
  link_ok_at: string | null;
  last_error: string | null;
};

type Today = {
  salesperson_id: string;
  messages_sent: number;
  leads_messaged: number;
  leads_given_details: number;
  leads_who_replied: number;
};

/**
 * How much WhatsApp the watcher saw today, split by whether the other party was
 * a lead. Counts only — never who, never what. It exists so a row of zeros can
 * explain itself.
 */
type Seen = {
  salesperson_id: string;
  matched: number;
  unmatched: number;
};

/** IST calendar day, which is what v_rep_whatsapp_daily.day_ist is keyed on. */
function istToday(): string {
  return new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
}

/**
 * Connected · Stale · Disconnected — three states, never two.
 *
 * The founder's rule: do not present 0 as "no activity" when the observer is
 * not healthy. A watcher that logged out at 11am reports exactly the same
 * numbers as a rep who sent nothing, and only one of those is the rep's fault.
 *
 * IS THE LINK UP IS NOT THE SAME QUESTION AS IS ANYTHING ARRIVING.
 *
 * This used to be computed purely from last_seen_at, which the ingest stamps
 * only when there is data to report. So a rep whose WhatsApp was linked and
 * perfectly healthy, but who had not messaged a lead that morning, read as
 * "Disconnected — Never connected, have the rep scan the QR". Ankita's own
 * phone listed the device as active at the same moment this card said that,
 * and the only remedy it offered was the one thing that could not help.
 *
 * It lied in the other direction too: `status` from the worker was never
 * consulted, so a genuinely dead link kept reading Connected for two hours
 * after its final message.
 *
 * So health now comes from link_ok_at — stamped by the worker's heartbeat, by
 * a status poll, or by real traffic — together with what the worker says. A
 * heartbeat every four minutes means a fifteen-minute window is generous
 * without being slow to notice a real drop.
 *
 * The last branch is the compatibility path: link_ok_at is null for any worker
 * older than 2026.09.10-13, and until that build is uploaded the old
 * traffic-based reading is still the best available guess. Two hours there
 * matches v_rep_whatsapp_health and the Daily Pulse, so the dashboard and the
 * 7pm report cannot disagree about whether a rep was being watched.
 */
type Health = "connected" | "stale" | "scan" | "disconnected";

const LINK_FRESH_MS = 15 * 60_000;

function healthOf(s: Session): Health {
  // WHAT THE WORKER SAYS ABOUT ITSELF COMES FIRST.
  //
  // The compatibility fallback below reads recent traffic as proof of a live
  // link. That was fine until a deploy wiped the login: the worker sat on
  // status "qr" waiting to be scanned while an hour-old ingest timestamp kept
  // the card green. Both halves were technically true and together they said
  // the opposite of what was happening.
  //
  // A worker reporting anything other than "connected" is reporting it NOW,
  // and that always beats an inference drawn from an old timestamp.
  if (s.status === "qr") return "scan";
  if (s.status && s.status !== "connected") return "disconnected";

  if (s.link_ok_at) {
    return Date.now() - new Date(s.link_ok_at).getTime() < LINK_FRESH_MS ? "connected" : "stale";
  }
  if (!s.last_seen_at) return "disconnected";
  return Date.now() - new Date(s.last_seen_at).getTime() < 2 * 3600_000 ? "connected" : "stale";
}

const HEALTH_LABEL: Record<Health, string> = {
  connected: "Connected",
  stale: "Stale",
  scan: "Waiting for scan",
  disconnected: "Disconnected",
};
const HEALTH_TONE: Record<Health, string> = {
  connected: "#22c55e", stale: "#f59e0b", scan: "#f59e0b", disconnected: "#ef4444",
};

function ago(iso: string | null): string {
  if (!iso) return "never";
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.floor(m / 60)}h ago`;
  return `${Math.floor(m / 1440)}d ago`;
}

/**
 * Telecaller WhatsApp — connect a rep's own number, read only.
 *
 * WHAT THIS IS, AND WHAT IT IS NOT
 *
 * The number in the card above this one is the founder's, and it SENDS — the
 * daily pulse to the founder and to the reps. This card is the opposite: a
 * telecaller's own number, watched as a linked device, which never sends
 * anything. The rep goes on messaging buyers by hand exactly as before. All the
 * CRM does is write down what happened, so the Daily Pulse stops pretending
 * WhatsApp work does not exist.
 *
 * Two different jobs, two different tables (wa_rep_sessions here,
 * whatsapp_baileys above), and only one of them has a send path anywhere in the
 * codebase. They are deliberately not merged.
 *
 * WHAT THE REP'S PRIVACY IS PROTECTED BY
 *
 * A message is only ever stored when the other party is a lead in this company.
 * Everything else — family, friends, anything personal — is dropped before it
 * reaches the database, by match_wa_contact on the server. Worth saying out
 * loud to the rep before asking them to scan a QR, which is why it is printed
 * on this card rather than buried in a migration.
 *
 * Since migration 0170 a lead conversation is stored IN FULL and readable on
 * that lead. That makes the disclosure above more important, not less: the
 * honest sentence is "conversations with your leads are company property,
 * everything else on your phone is untouched", and a rep is owed both halves
 * of it before they link a device.
 */
export function TelecallerWhatsApp({
  companyId, companyName, reps, isSuper,
}: { companyId: string; companyName: string | null; reps: Rep[]; isSuper: boolean }) {
  // ONE CLIENT, OR THE QR POLLER EATS THE EDGE FUNCTION ALIVE.
  //
  // createClient() builds a NEW object every call, and this used to run on
  // every render. That identity is a dependency of load() and call(), which are
  // dependencies of the QR polling effect — so the effect tore down and re-ran
  // on every render, fired its first tick immediately, called setQr, caused a
  // render, and went round again. A tight loop of edge-function calls.
  //
  // The symptom was the QR appearing for about a second and then the card
  // showing "Edge Function returned a non-2xx status code": the first tick
  // worked, the flood that followed did not. It reads like a broken endpoint
  // and is really a broken dependency array.
  const supabase = useMemo(() => createClient(), []);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [today, setToday] = useState<Today[]>([]);
  const [seen, setSeen] = useState<Seen[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // The one field an admin has to type. The secret is set on the worker itself,
  // never pasted here — a bearer that reaches the browser is a bearer in the
  // browser's history.
  const [adding, setAdding] = useState(false);
  const [repId, setRepId] = useState("");
  // The founder's worker address. Not typed by the admin any more: the worker
  // holds many logins and a telecaller is a PATH on it, so asking for an address
  // could only ever be answered with the founder's own — which is exactly the
  // mistake that used to watch the founder's WhatsApp under a rep's name.
  const [founderUrl, setFounderUrl] = useState<string | null>(null);
  // QR for the rep currently being connected, fetched through the CRM so the
  // worker's secret never reaches this browser.
  const [qrFor, setQrFor] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [qrNote, setQrNote] = useState<string | null>(null);
  // "Waiting for WhatsApp to offer a QR…" could sit there forever, and for a
  // rep whose saved login is dead it always would: a session WITH credentials
  // resumes instead of pairing, so no qr event is ever emitted. The panel now
  // notices it has been waiting too long and offers the one thing that
  // actually fixes it — throwing the saved login away.
  const [qrStuck, setQrStuck] = useState(false);
  // WHICH LOGIN ARE WE WAITING FOR?
  //
  // "Connected" on its own is not proof that anybody scanned anything. If the
  // login being replaced is still reporting itself, or a dying socket writes
  // its old credentials back and the new session resumes them, the worker says
  // connected and the rep never saw a square. That is exactly what re-scanning
  // Ankita's number did every time.
  //
  // Each reset returns the credential generation it moved the rep to. The
  // panel holds that number and refuses to call it connected until the worker
  // reports the same one back. Null means a worker too old to say — then the
  // old behaviour stands, because refusing to ever show success would be worse.
  const [wantGen, setWantGen] = useState<number | null>(null);
  // Which build is actually answering, and whether it is answering at all.
  // "Is the worker even on the new version?" was costing a trip through the
  // hosting panel every time; it belongs on the screen that depends on it.
  const [workerBuild, setWorkerBuild] = useState<string | null>(null);
  const [workerDown, setWorkerDown] = useState(false);
  // The WhatsApp protocol version the worker claimed, and whether it looked it
  // up or fell back. When WhatsApp closes the handshake before offering a QR,
  // this is the fact that decides what to do next.
  const [waVersion, setWaVersion] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: s }, { data: t }, { data: f }, { data: a }] = await Promise.all([
      supabase.from("wa_rep_sessions")
        .select("salesperson_id, base_url, status, wa_number, last_seen_at, link_ok_at, last_error")
        .eq("company_id", companyId).returns<Session[]>(),
      supabase.from("v_rep_whatsapp_daily")
        .select("salesperson_id, messages_sent, leads_messaged, leads_given_details, leads_who_replied")
        .eq("company_id", companyId).eq("day_ist", istToday()).returns<Today[]>(),
      supabase.from("whatsapp_baileys").select("base_url")
        .eq("company_id", companyId).maybeSingle<{ base_url: string | null }>(),
      // What the gate dropped. Without this a zero row is unreadable: a rep who
      // barely uses WhatsApp and a rep having four hundred conversations with
      // numbers that are not in the CRM look identical, and only one of those
      // is a finding.
      supabase.from("wa_rep_activity_daily")
        .select("salesperson_id, matched, unmatched")
        .eq("company_id", companyId).eq("day_ist", istToday()).returns<Seen[]>(),
    ]);
    setSessions(s ?? []);
    setToday(t ?? []);
    setSeen(a ?? []);
    setFounderUrl(f?.base_url ?? null);
    setLoading(false);
    return (s ?? []).map((x) => x.salesperson_id);
  }, [supabase, companyId]);

  // Probe once when the card opens, not on a timer. An admin looking at this
  // page wants the truth now; nobody needs it refreshed every ten seconds while
  // the tab sits in the background poking a WhatsApp worker.
  //
  // Keyed on the company, so the super admin switching tenants gets a fresh
  // probe rather than the previous company's answer.
  const probed = useRef<string | null>(null);
  useEffect(() => {
    void load().then((ids) => {
      if (probed.current === companyId) return;
      probed.current = companyId;
      void probe(ids);
    });
    // probe is stable per company and would only re-fire this. Intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, companyId]);

  /** notify-provider does the talking; the worker's bearer stays server-side. */
  const call = useCallback(async (action: string, salespersonId: string) => {
    const { data, error } = await supabase.functions.invoke<Record<string, unknown>>(
      "notify-provider", { body: { action, company_id: companyId, salesperson_id: salespersonId } },
    );
    if (error) return { ok: false, error: error.message } as Record<string, unknown> & { ok: boolean };
    return (data ?? { ok: false, error: "no answer" }) as Record<string, unknown> & { ok: boolean };
  }, [supabase, companyId]);

  /**
   * Ask the worker how each session is really doing, once per open.
   *
   * The table alone reads the mirrored row, and a mirror is only as fresh as the
   * last thing that wrote it. This is also the only thing that catches a
   * BACKLOG: WhatsApp connected, worker happy, and every batch bouncing off the
   * ingest — which is what a missing BAILEYS_INGEST_SECRET looks like from here.
   * notify-provider writes that into last_error, so the row explains itself.
   */
  const probe = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    await Promise.all(ids.map((id) => call("rep_status", id)));
    const { data: s } = await supabase.from("wa_rep_sessions")
      .select("salesperson_id, base_url, status, wa_number, last_seen_at, link_ok_at, last_error")
      .eq("company_id", companyId).returns<Session[]>();
    if (s) setSessions(s);
  }, [call, supabase, companyId]);

  /**
   * Open the QR for one rep and keep it fresh.
   *
   * WhatsApp's QR expires in about twenty seconds, so a square fetched once is a
   * square that silently stops working while the rep is still finding Linked
   * devices. This asks the worker to start the session, then re-polls until the
   * rep has scanned it.
   */
  const openQr = useCallback(async (id: string, fresh = false) => {
    setQrFor(id); setQr(null); setMsg(null); setQrStuck(false); setWantGen(null);
    setQrNote(fresh ? "Unlinking the old device…" : "Starting the session…");
    // rep_reset forgets the saved credentials so WhatsApp treats this as a
    // first link — the only way to get a QR back, and the only way it sends the
    // conversation history. rep_reconnect just resumes and would show nothing.
    const r = await call(fresh ? "rep_reset" : "rep_reconnect", id);
    if (!r.ok) { setQrNote(null); setQrFor(null); setMsg(String(r.error ?? "Could not reach the worker.")); return; }
    if (fresh && typeof r.gen === "number") setWantGen(r.gen);
    setQrNote("Waiting for WhatsApp to offer a QR…");
  }, [call]);

  // One poller, driven by which rep's QR is on screen. Stops itself the moment
  // the panel closes or the scan lands, so a forgotten card cannot sit there
  // hammering the worker all afternoon.
  useEffect(() => {
    if (!qrFor) return;
    let alive = true;
    let waited = 0;
    const tick = async () => {
      const r = await call("rep_qr", qrFor);
      if (!alive) return;
      if (!r.ok) { setQrNote(String(r.error ?? "Could not reach the worker.")); return; }
      // Only the login we asked for counts. A "connected" carrying the previous
      // generation is the old session still talking, or a resumed credential
      // that came back from the dead — either way nobody scanned, and calling
      // it success is what hid this bug for weeks.
      const gen = typeof r.gen === "number" ? (r.gen as number) : null;
      const rightLogin = wantGen === null || gen === null || gen >= wantGen;
      if (r.status === "connected" && rightLogin) {
        setQr(null); setQrNote("Connected. This rep's WhatsApp is now being watched.");
        setQrStuck(false);
        void load();
        return;
      }
      setQr((r.qr as string) ?? null);
      // THE WORKER'S OWN WORDS, WHEN IT HAS ANY.
      //
      // "Waiting for WhatsApp to offer a QR…" was shown for a worker that was
      // switched off, a worker throwing 500s, and a worker stuck on a version
      // lookup that never returned. One sentence for three problems is how a
      // fixed bug still looks broken.
      const workerSaid = (r.error as string | null) ?? null;
      setQrNote(
        r.qr
          ? null
          : workerSaid
            ? workerSaid
            : r.status === "connected"
              // Says the true thing rather than the reassuring one: the worker
              // is reporting the login we just replaced, so the square is
              // still coming.
              ? "Still finishing with the old login — the new QR is coming…"
              : "Waiting for WhatsApp to offer a QR…",
      );
      setWorkerBuild((r.worker_version as string | null) ?? null);
      setWorkerDown(r.reachable === false);
      setWaVersion(
        r.wa_version
          ? `${r.wa_version} (${r.wa_version_source ?? "source unknown"})`
          : (r.wa_version_source as string | null) ?? null,
      );
      // Three empty polls — about twenty seconds — is well past the point where
      // a healthy pairing would have produced a square. Past that it is not
      // slowness, it is a session resuming a login that no longer works.
      if (!r.qr) { waited += 1; if (waited >= 3) setQrStuck(true); } else { waited = 0; setQrStuck(false); }
    };
    void tick();
    const h = setInterval(() => void tick(), 6000);
    return () => { alive = false; clearInterval(h); };
  }, [qrFor, wantGen, call, load]);

  const add = async () => {
    if (!repId) { setMsg("Pick a telecaller first."); return; }
    if (!founderUrl) {
      setMsg("Set the Baileys worker address in Founder notifications above first — telecallers share that worker.");
      return;
    }
    setBusy("add");
    setMsg(null);
    const { error } = await supabase.from("wa_rep_sessions").upsert({
      company_id: companyId,
      salesperson_id: repId,
      // Recorded so the table can show where this session lives, but it is the
      // founder's worker: one process, one login per rep, addressed by path.
      base_url: founderUrl,
      status: "disconnected",
    }, { onConflict: "salesperson_id" });
    setBusy(null);
    if (error) { setMsg(error.message); return; }
    const connected = repId;
    setAdding(false); setRepId("");
    await load();
    // Straight into the QR. Saving a row and then leaving an admin to work out
    // what to do next is how a setup flow stalls at step one.
    //
    // A fresh link even though this rep is new to the table: a rep who was
    // removed and re-added still has credentials on the worker's disk, and
    // resuming those is precisely the silent "Connected, no QR" this flow keeps
    // falling into. One path for everyone.
    void openQr(connected, true);
  };

  const remove = async (id: string) => {
    setBusy(id);
    if (qrFor === id) { setQrFor(null); setQr(null); setQrNote(null); }
    // The messages already observed stay. Removing a session stops the watching;
    // deleting a rep's recorded work with it would be a surprise, and the Daily
    // Pulse for last week should not change because someone unplugged a worker.
    const { error } = await supabase.from("wa_rep_sessions").delete().eq("salesperson_id", id);
    setBusy(null);
    if (error) { setMsg(error.message); return; }
    await load();
  };

  const byRep = new Map(today.map((t) => [t.salesperson_id, t]));
  const seenBy = new Map(seen.map((x) => [x.salesperson_id, x]));
  const repName = new Map(reps.map((r) => [r.id, r.full_name || "Telecaller"]));
  const unconnected = reps.filter((r) => !sessions.some((s) => s.salesperson_id === r.id));

  return (
    <div className="card" style={{ marginTop: 28 }}>
      {/* THE COMPANY, NAMED, ON THE CARD ITSELF.
          The picker that decides it is at the very top of a long page, so by
          the time you reach this table you cannot see which company you are
          looking at — and the telecaller dropdown below only ever lists this
          company's reps. Two controls, one of them off-screen, and no way to
          tell they were related. Naming it here is the whole fix. */}
      <h3 style={{ marginBottom: 4 }}>
        📱 Telecaller WhatsApp{companyName ? ` · ${companyName.trim()}` : ""}
      </h3>
      <p className="subtitle" style={{ marginTop: 0 }}>
        Connect a telecaller&apos;s own WhatsApp so their messages to leads show up in the
        Daily Pulse. <strong>It only watches — it never sends.</strong> The rep keeps
        messaging buyers by hand exactly as now.
        {isSuper && companyName && (
          <> Only <strong>{companyName.trim()}</strong>&apos;s telecallers appear here — switch
          company at the top of the page to see another team&apos;s.</>
        )}
      </p>
      <p className="subtitle" style={{ marginTop: 0, fontSize: 12 }}>
        Only messages to and from <strong>your own leads</strong> are saved — and those are saved
        in full, so you can read the conversation on the lead. Anything else on the rep&apos;s
        phone — family, friends, personal chats — is dropped before it reaches the CRM.{" "}
        <strong>Tell them both halves of that before they scan.</strong>
      </p>

      {msg && <div className="empty" style={{ color: "#ef4444" }}>{msg}</div>}

      {loading ? (
        <div className="empty">Loading…</div>
      ) : sessions.length === 0 ? (
        <div className="empty">No telecaller connected yet. Add one below.</div>
      ) : (
        <table className="table" style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th>Telecaller</th>
              <th>Connection</th>
              <th style={{ textAlign: "right" }}>Msgs</th>
              <th style={{ textAlign: "right" }}>Leads</th>
              <th style={{ textAlign: "right" }}>Got details ★</th>
              <th style={{ textAlign: "right" }}>Replied ★</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => {
              const t = byRep.get(s.salesperson_id);
              const health = healthOf(s);
              // The counts are only meaningful while something is listening.
              // When it is not, the cells read "—" rather than 0: an unknown
              // printed as a zero is the one thing this card must never do.
              const trusted = health === "connected";
              const num = (n: number | undefined) => (trusted ? (n ?? 0) : "—");
              return (
                <tr key={s.salesperson_id}>
                  <td>
                    <strong>{repName.get(s.salesperson_id) ?? "Telecaller"}</strong>
                    {s.wa_number && <div className="subtitle" style={{ fontSize: 12 }}>{s.wa_number}</div>}
                  </td>
                  <td>
                    <span style={{ color: HEALTH_TONE[health], fontWeight: 600 }}>
                      {HEALTH_LABEL[health]}
                    </span>
                    {/* SAY WHICH OF THE TWO FACTS IS BEING REPORTED.
                        One line used to serve both, and it told a rep with a
                        live linked device to go and scan a QR. "Link checked"
                        is about the connection; "last message" is about
                        traffic, and a linked rep having a quiet morning is
                        entitled to have nothing in the second one. */}
                    <div className="subtitle" style={{ fontSize: 12 }}>
                      {health === "scan"
                        ? "A QR is ready and waiting — press Re-scan and have the rep scan it"
                        : s.last_error
                          ? s.last_error
                          : health === "disconnected"
                            ? (s.link_ok_at || s.last_seen_at
                                ? "The link has dropped — have the rep scan a new QR"
                                : "Never connected — have the rep scan the QR")
                            : health === "stale"
                              ? `Link last confirmed ${ago(s.link_ok_at ?? s.last_seen_at)} — the worker may be down`
                              : `Link checked ${ago(s.link_ok_at ?? s.last_seen_at)} · ` +
                                (s.last_seen_at
                                  ? `last message ${ago(s.last_seen_at)}`
                                  : "no messages yet")}
                    </div>
                    {/* WHY THE ROW IS ZERO.
                        A rep who barely opens WhatsApp and a rep having four
                        hundred conversations with numbers that are not in the
                        CRM produce an identical row of zeros, and only one of
                        those is a finding. Counts only — the card never learns
                        who those conversations were with. */}
                    {(() => {
                      const sn = seenBy.get(s.salesperson_id);
                      if (!trusted || !sn || sn.unmatched === 0) return null;
                      return (
                        <div style={{ fontSize: 12, marginTop: 4, color: sn.matched === 0 ? "#f59e0b" : undefined }}>
                          {sn.matched === 0
                            ? `${sn.unmatched} messages seen today — none with a lead of this company`
                            : `+${sn.unmatched} more with numbers not in the CRM`}
                        </div>
                      );
                    })()}
                  </td>
                  <td style={{ textAlign: "right" }}>{num(t?.messages_sent)}</td>
                  <td style={{ textAlign: "right" }}>{num(t?.leads_messaged)}</td>
                  {/* The two the founder reads first. */}
                  <td style={{ textAlign: "right" }}><strong>{num(t?.leads_given_details)}</strong></td>
                  <td style={{ textAlign: "right" }}><strong>{num(t?.leads_who_replied)}</strong></td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    {/* THE MISSING OPTION. This card could show a rep was
                        Connected with a real WhatsApp number attached and give
                        no way to read a single message they sent — the only
                        routes in were a lead's own page or a separate Platform
                        page nobody was pointed at. One click from where the
                        admin is already looking. */}
                    {isSuper && (
                      <a href={`/dashboard/platform/telecallers-activity?rep=${s.salesperson_id}`}
                        className="btn-ghost" style={{ textDecoration: "none", display: "inline-block" }}>
                        View chats
                      </a>
                    )}
                    {/* THIS BUTTON ALWAYS STARTS A FRESH LINK. IT USED TO GUESS.
                        It picked between "resume the saved login" and "throw it
                        away", using this row as evidence — connected, or a
                        wa_number proving they had linked before. Both readings
                        come from a mirrored row that can be wrong, and for
                        Ankita they were: her row said disconnected with no
                        number while a perfectly good credential sat on the
                        worker's disk. So the button chose resume, the worker
                        resumed, and the panel reported Connected without ever
                        showing a square. Twice, on two different days.
                        A resume is never what someone pressing this wants —
                        the worker already resumes by itself on restart, and
                        only a fresh link makes WhatsApp send the history. One
                        behaviour, no guessing, and the confirm is honest about
                        the cost. */}
                    <button className="btn-ghost"
                      onClick={() => {
                        const name = repName.get(s.salesperson_id) ?? "this telecaller";
                        if (!confirm(`Get a new QR for ${name}?\n\n` +
                          "Their old link is removed and they scan again from their own phone. " +
                          "This is also the only way to import chats from before they first " +
                          "connected — WhatsApp sends the history only on a fresh link.\n\n" +
                          "Messages already saved are kept.")) return;
                        void openQr(s.salesperson_id, true);
                      }}>
                      {health === "connected" ? "Re-scan" : "Show QR"}
                    </button>
                    <button className="btn-ghost" disabled={busy === s.salesperson_id}
                      onClick={() => void remove(s.salesperson_id)}>
                      {busy === s.salesperson_id ? "…" : "Disconnect"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {qrFor && (
        <div style={{
          marginTop: 16, padding: 16, borderRadius: 12, border: "1px solid #e5e7eb",
          textAlign: "center", maxWidth: 380,
        }}>
          <strong>{repName.get(qrFor) ?? "Telecaller"}</strong>
          <p className="subtitle" style={{ fontSize: 12, marginTop: 4 }}>
            On <strong>{repName.get(qrFor) ?? "the rep"}&apos;s own phone</strong>: WhatsApp →
            Settings → Linked devices → Link a device.
          </p>
          {qr
            /* eslint-disable-next-line @next/next/no-img-element */
            ? <img src={qr} alt="WhatsApp QR" width={280} height={280} style={{ maxWidth: "100%", height: "auto" }} />
            : <div className="empty">{qrNote ?? "…"}</div>}
          {qr && qrNote && <div className="subtitle" style={{ fontSize: 12 }}>{qrNote}</div>}
          {/* THE WAY OUT OF THE WAIT THAT NEVER ENDS.
              Without this the panel just sat on "Waiting for WhatsApp to offer
              a QR…", and for the one case that matters — a saved login that
              WhatsApp no longer honours — it would have sat there all day,
              because a session with credentials resumes instead of pairing and
              never emits a QR at all. */}
          {qrStuck && !qr && (
            <div style={{
              marginTop: 10, padding: 10, borderRadius: 10, textAlign: "left",
              background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.28)",
            }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: "#f59e0b" }}>
                {workerDown ? "The WhatsApp worker is not answering." : "Still no QR."}
              </div>
              <div style={{ fontSize: 12.5, marginTop: 4 }}>
                {workerDown
                  ? "Nothing on this card can work until the service is running again. " +
                    "Restart it on the host, then press Ask again."
                  : "Ask for it once more — that is usually enough. If two tries do nothing, " +
                    "restart the worker on the host and come back here."}
              </div>
              {/* Named on the card because the alternative is guessing. Twice
                  now a fix has been shipped, deployed, and then debugged from
                  scratch because nobody could tell whether the box was running
                  the new build or the old one. */}
              <div style={{ fontSize: 11.5, marginTop: 6, opacity: 0.75 }}>
                Worker build: {workerBuild ?? "not reported — this is an older build"}
                {waVersion && <><br />WhatsApp version claimed: {waVersion}</>}
              </div>
              <button className="btn" style={{ marginTop: 8 }}
                onClick={() => void openQr(qrFor, true)}>
                Ask again
              </button>
            </div>
          )}
          <div style={{ marginTop: 10 }}>
            <button className="btn-ghost" onClick={() => { setQrFor(null); setQr(null); setQrNote(null); setQrStuck(false); setWantGen(null); }}>
              Close
            </button>
          </div>
        </div>
      )}

      {adding ? (
        <div style={{ marginTop: 16, display: "grid", gap: 10, maxWidth: 460 }}>
          <label>
            Which telecaller{companyName ? ` from ${companyName.trim()}` : ""}?
            <select value={repId} onChange={(e) => setRepId(e.target.value)}>
              <option value="">Choose a telecaller…</option>
              {unconnected.map((r) => (
                <option key={r.id} value={r.id}>{r.full_name || "Telecaller"}</option>
              ))}
            </select>
          </label>
          <p className="subtitle" style={{ fontSize: 12, marginTop: 0 }}>
            That is the only thing to fill in — the company is already set{companyName ? ` to ${companyName.trim()}` : ""}.
            The QR opens by itself once you save. Have the rep scan it from{" "}
            <strong>their own phone</strong>: WhatsApp → Settings → Linked devices → Link a device.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" disabled={busy === "add"} onClick={() => void add()}>
              {busy === "add" ? "Saving…" : "Save"}
            </button>
            <button className="btn-ghost" onClick={() => { setAdding(false); setMsg(null); }}>Cancel</button>
          </div>
        </div>
      ) : (
        <button className="btn" style={{ marginTop: 16 }}
          disabled={unconnected.length === 0}
          onClick={() => setAdding(true)}>
          {unconnected.length === 0 ? "Every telecaller is connected" : "Add a telecaller"}
        </button>
      )}
    </div>
  );
}
