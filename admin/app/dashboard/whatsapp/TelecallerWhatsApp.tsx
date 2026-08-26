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
  last_error: string | null;
};

type Today = {
  salesperson_id: string;
  messages_sent: number;
  leads_messaged: number;
  leads_given_details: number;
  leads_who_replied: number;
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
 * Two hours matches v_rep_whatsapp_health and the Daily Pulse, so the dashboard
 * and the 7pm report can never disagree about whether a rep was being watched.
 */
type Health = "connected" | "stale" | "disconnected";

function healthOf(s: Session): Health {
  if (!s.last_seen_at) return "disconnected";
  return Date.now() - new Date(s.last_seen_at).getTime() < 2 * 3600_000 ? "connected" : "stale";
}

const HEALTH_LABEL: Record<Health, string> = {
  connected: "Connected",
  stale: "Stale",
  disconnected: "Disconnected",
};
const HEALTH_TONE: Record<Health, string> = {
  connected: "#22c55e", stale: "#f59e0b", disconnected: "#ef4444",
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
export function TelecallerWhatsApp({ companyId, reps }: { companyId: string; reps: Rep[] }) {
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

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: s }, { data: t }, { data: f }] = await Promise.all([
      supabase.from("wa_rep_sessions")
        .select("salesperson_id, base_url, status, wa_number, last_seen_at, last_error")
        .eq("company_id", companyId).returns<Session[]>(),
      supabase.from("v_rep_whatsapp_daily")
        .select("salesperson_id, messages_sent, leads_messaged, leads_given_details, leads_who_replied")
        .eq("company_id", companyId).eq("day_ist", istToday()).returns<Today[]>(),
      supabase.from("whatsapp_baileys").select("base_url")
        .eq("company_id", companyId).maybeSingle<{ base_url: string | null }>(),
    ]);
    setSessions(s ?? []);
    setToday(t ?? []);
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
      .select("salesperson_id, base_url, status, wa_number, last_seen_at, last_error")
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
    setQrFor(id); setQr(null); setMsg(null);
    setQrNote(fresh ? "Forgetting the old login…" : "Starting the session…");
    // rep_reset forgets the saved credentials so WhatsApp treats this as a
    // first link — the only way to get a QR back, and the only way it sends the
    // conversation history. rep_reconnect just resumes and would show nothing.
    const r = await call(fresh ? "rep_reset" : "rep_reconnect", id);
    if (!r.ok) { setQrNote(null); setQrFor(null); setMsg(String(r.error ?? "Could not reach the worker.")); return; }
    setQrNote("Waiting for WhatsApp to offer a QR…");
  }, [call]);

  // One poller, driven by which rep's QR is on screen. Stops itself the moment
  // the panel closes or the scan lands, so a forgotten card cannot sit there
  // hammering the worker all afternoon.
  useEffect(() => {
    if (!qrFor) return;
    let alive = true;
    const tick = async () => {
      const r = await call("rep_qr", qrFor);
      if (!alive) return;
      if (!r.ok) { setQrNote(String(r.error ?? "Could not reach the worker.")); return; }
      if (r.status === "connected") {
        setQr(null); setQrNote("Connected. This rep's WhatsApp is now being watched.");
        void load();
        return;
      }
      setQr((r.qr as string) ?? null);
      setQrNote((r.qr ? null : "Waiting for WhatsApp to offer a QR…"));
    };
    void tick();
    const h = setInterval(() => void tick(), 6000);
    return () => { alive = false; clearInterval(h); };
  }, [qrFor, call, load]);

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
    void openQr(connected);
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
  const repName = new Map(reps.map((r) => [r.id, r.full_name || "Telecaller"]));
  const unconnected = reps.filter((r) => !sessions.some((s) => s.salesperson_id === r.id));

  return (
    <div className="card" style={{ marginTop: 28 }}>
      <h3 style={{ marginBottom: 4 }}>📱 Telecaller WhatsApp</h3>
      <p className="subtitle" style={{ marginTop: 0 }}>
        Connect a telecaller&apos;s own WhatsApp so their messages to leads show up in the
        Daily Pulse. <strong>It only watches — it never sends.</strong> The rep keeps
        messaging buyers by hand exactly as now.
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
                    <div className="subtitle" style={{ fontSize: 12 }}>
                      {s.last_error
                        ? s.last_error
                        : health === "disconnected"
                          ? "Never connected — have the rep scan the QR"
                          : `last heard ${ago(s.last_seen_at)}`}
                    </div>
                  </td>
                  <td style={{ textAlign: "right" }}>{num(t?.messages_sent)}</td>
                  <td style={{ textAlign: "right" }}>{num(t?.leads_messaged)}</td>
                  {/* The two the founder reads first. */}
                  <td style={{ textAlign: "right" }}><strong>{num(t?.leads_given_details)}</strong></td>
                  <td style={{ textAlign: "right" }}><strong>{num(t?.leads_who_replied)}</strong></td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    {/* Two different things, and conflating them is what made
                        an already-linked rep unfixable: Show QR resumes, Re-scan
                        throws the saved login away so WhatsApp starts over and
                        sends the conversation history. */}
                    <button className="btn-ghost"
                      onClick={() => {
                        if (health === "connected" &&
                            !confirm(`Re-link ${repName.get(s.salesperson_id) ?? "this telecaller"}'s WhatsApp?\n\n` +
                              "They will have to scan a new QR. Do this to import conversations from " +
                              "before they first connected — WhatsApp only sends the history on a fresh link.\n\n" +
                              "Messages already saved are kept.")) return;
                        void openQr(s.salesperson_id, health === "connected");
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
            On the rep&apos;s phone: WhatsApp → Settings → Linked devices → Link a device.
          </p>
          {qr
            /* eslint-disable-next-line @next/next/no-img-element */
            ? <img src={qr} alt="WhatsApp QR" width={280} height={280} style={{ maxWidth: "100%", height: "auto" }} />
            : <div className="empty">{qrNote ?? "…"}</div>}
          {qr && qrNote && <div className="subtitle" style={{ fontSize: 12 }}>{qrNote}</div>}
          <div style={{ marginTop: 10 }}>
            <button className="btn-ghost" onClick={() => { setQrFor(null); setQr(null); setQrNote(null); }}>
              Close
            </button>
          </div>
        </div>
      )}

      {adding ? (
        <div style={{ marginTop: 16, display: "grid", gap: 10, maxWidth: 460 }}>
          <label>
            Telecaller
            <select value={repId} onChange={(e) => setRepId(e.target.value)}>
              <option value="">Choose…</option>
              {unconnected.map((r) => (
                <option key={r.id} value={r.id}>{r.full_name || "Telecaller"}</option>
              ))}
            </select>
          </label>
          <p className="subtitle" style={{ fontSize: 12, marginTop: 0 }}>
            That is the only thing to fill in. The QR opens by itself once you save — have
            the rep scan it from their own phone: <strong>WhatsApp → Settings → Linked
            devices → Link a device</strong>.
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
