import { createClient } from "@/lib/supabase/server";
import { captureLead } from "./actions";
import { WaThread } from "./WaThread";

/**
 * Every telecaller on the platform, one screen, worst first.
 *
 * WHY THIS IS NOT ANOTHER PER-COMPANY PAGE
 *
 * The super admin's question — "who is not working?" — does not stop at a
 * company boundary. Platform HQ and the leaks page both make you pick a company
 * first, so answering it meant opening eight pages and holding the comparison in
 * your head. The finding that mattered (two reps at Manas property with a
 * hundred leads each and not one call between them) was two clicks deep in one
 * of them.
 *
 * PHONE AND WHATSAPP IN THE SAME ROW
 *
 * Neither number alone is fair, and judging on one of them produces exactly the
 * wrong answer. Ankita's WhatsApp reads zero — and she made 578 calls in seven
 * days, the most of anyone on this platform. A screen that had shown only
 * WhatsApp would have accused the hardest-working rep here of doing nothing.
 *
 * WHAT CAN AND CANNOT BE READ
 *
 * Lead conversations, in full, for any rep in any company — RLS already grants
 * the super admin that, and a complaint to a founder needs evidence, not a
 * number. A rep's personal chats were never stored and cannot be produced here
 * or anywhere else in this product.
 */

type Row = {
  company_id: string;
  company_name: string;
  rep_id: string;
  rep_name: string | null;
  is_active: boolean;
  leads_assigned: number;
  calls: number;
  connected_calls: number;
  talk_seconds: number;
  last_call_at: string | null;
  wa_messages: number;
  wa_leads: number;
  wa_details: number;
  wa_replies: number;
  wa_calls: number;
  wa_watch: "none" | "ok" | "stale";
  wa_offbook: number;
  silent: boolean;
  /** Buyer said something that reads as ready-to-move or about-to-walk, from
   *  a plain keyword read of their own WhatsApp text — see migration 0175.
   *  Not a rating of the rep; a buyer going quiet after "we found another
   *  builder" is not the rep's doing, but it is the rep's job to know it
   *  happened, and this is how a super admin knows too. */
  wa_hot: number;
  wa_risk: number;
};

type Msg = {
  contact_id: string;
  lead_name: string | null;
  lead_phone: string | null;
  stage: string | null;
  direction: "in" | "out";
  body: string | null;
  media_kind: string | null;
  file_name: string | null;
  shared_details: boolean;
  read_at: string | null;
  sent_at: string;
  signal: "hot" | "risk" | null;
  /** Set when the rep used "delete for everyone". The message is kept — that is
   *  the point — and body_original holds what it said. */
  deleted_at: string | null;
  edited_at: string | null;
  body_original: string | null;
  /** Path in the private wa-media bucket, or null when the file was not
   *  captured. Never rendered directly — a signed URL is minted per view. */
  media_path: string | null;
  transcript: string | null;
  duration_seconds: number | null;
};

/** A number this rep talked to that is not a lead in their company. Counts and
 *  identity only — never the message bodies, which stay on the lead pages. */
type UnknownRow = {
  peer_phone: string;
  peer_name: string | null;
  messages: number;
  they_sent: number;
  rep_sent: number;
  /** Times this rep also DIALLED this number. The strongest predictor that an
   *  unknown number is a real working relationship rather than a wrong dial. */
  calls: number;
  first_seen: string;
  last_seen: string;
};

/** One conversation with a number that is not a lead. */
type PeerMsg = {
  direction: "in" | "out";
  body: string | null;
  media_kind: string | null;
  file_name: string | null;
  media_path: string | null;
  transcript: string | null;
  duration_seconds: number | null;
  signal: "hot" | "risk" | null;
  deleted_at: string | null;
  edited_at: string | null;
  body_original: string | null;
  peer_name: string | null;
  sent_at: string;
};

/** The same message, sent to many different people. */
type Blast = {
  body: string;
  sent_to: number;
  times_sent: number;
  replies_from: number;
  first_at: string;
  last_at: string;
};

/** Is the linked WhatsApp even the number this rep talks to buyers on? */
type Fit = {
  leads_called: number;
  numbers_whatsapped: number;
  overlap: number;
  called_and_messaged: number;
  wa_number: string | null;
};

const RANGES = [1, 7, 30] as const;

function fmtTalk(s: number) {
  if (s >= 3600) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  if (s >= 60) return `${Math.floor(s / 60)}m`;
  return `${s}s`;
}

function ago(iso: string | null): string {
  if (!iso) return "never";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400_000);
  if (d >= 1) return `${d}d ago`;
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3600_000);
  return h >= 1 ? `${h}h ago` : "today";
}

const WATCH_LABEL: Record<Row["wa_watch"], string> = {
  none: "not connected",
  ok: "watching",
  stale: "stale",
};
const WATCH_TONE: Record<Row["wa_watch"], string | undefined> = {
  none: undefined, ok: "#22c55e", stale: "#f59e0b",
};

export default async function TelecallerActivityPage({
  searchParams,
}: {
  searchParams: { rep?: string; days?: string; peer?: string };
}) {
  const supabase = await createClient();
  const days = RANGES.includes(Number(searchParams.days) as 1 | 7 | 30)
    ? Number(searchParams.days) : 7;
  const rep = searchParams.rep || "";
  const peer = searchParams.peer || "";

  const { data, error } = await supabase.rpc("super_rep_activity", { p_days: days });
  if (error) {
    return (
      <>
        <h2>👥 Telecaller activity</h2>
        <div className="error">Super admin only. ({error.message})</div>
      </>
    );
  }
  const rows = (data ?? []) as Row[];
  const current = rep ? rows.find((r) => r.rep_id === rep) ?? null : null;

  let msgs: Msg[] = [];
  let unknown: UnknownRow[] = [];
  let fit: Fit | null = null;
  let blasts: Blast[] = [];
  const mediaUrl = new Map<string, string>();
  if (current) {
    const [{ data: m }, { data: u }, { data: f }, { data: b }] = await Promise.all([
      supabase.rpc("super_rep_threads", { p_rep: current.rep_id, p_limit: 300 }),
      // 0 = every number ever. An uncaptured lead does not stop being
      // uncaptured because nobody messaged them this week; one that went
      // quiet in June is more at risk, not less.
      supabase.rpc("super_rep_unknown_numbers", { p_rep: current.rep_id, p_days: 0 }),
      supabase.rpc("super_rep_wa_fit", { p_rep: current.rep_id }),
      supabase.rpc("super_rep_blasts", { p_rep: current.rep_id, p_days: days }),
    ]);
    msgs = (m ?? []) as Msg[];
    unknown = (u ?? []) as UnknownRow[];
    fit = (Array.isArray(f) ? f[0] : f) as Fit ?? null;
    blasts = (b ?? []) as Blast[];

    // SIGNED, NEVER PUBLIC. wa-media is a private bucket for the same reason
    // call-recordings is: a buyer's voice note is not something that should be
    // reachable by anyone who guesses a path. One short-lived link per file,
    // minted here — after the RPC above has already enforced super-admin.
    const paths = msgs.map((x) => x.media_path).filter((p): p is string => Boolean(p));
    if (paths.length) {
      const { data: signed } = await supabase.storage
        .from("wa-media").createSignedUrls(paths, 60 * 60);
      for (const s of signed ?? []) {
        if (s.path && s.signedUrl) mediaUrl.set(s.path, s.signedUrl);
      }
    }
  }

  const qs = (o: { rep?: string; days?: number; peer?: string }) => {
    const p = new URLSearchParams();
    if (o.rep) p.set("rep", o.rep);
    if (o.days && o.days !== 7) p.set("days", String(o.days));
    if (o.peer) p.set("peer", o.peer);
    const s = p.toString();
    return s ? `?${s}` : "";
  };

  // ── one unknown number's conversation ─────────────────────────────────────
  //
  // The thread that could not be reached from anywhere. Everything above says
  // this number is worth looking at; this is where you find out whether it is a
  // buyer, a broker or the rep's cousin — which is a judgement only a person
  // can make, and only from the words.
  if (current && peer) {
    const { data: pm, error: pErr } = await supabase.rpc("super_rep_peer_thread", {
      p_rep: current.rep_id, p_peer: peer, p_limit: 400,
    });
    const thread = (pm ?? []) as PeerMsg[];
    const paths = thread.map((x) => x.media_path).filter((p): p is string => Boolean(p));
    const purl = new Map<string, string>();
    if (paths.length) {
      const { data: signed } = await supabase.storage.from("wa-media").createSignedUrls(paths, 3600);
      for (const s of signed ?? []) if (s.path && s.signedUrl) purl.set(s.path, s.signedUrl);
    }
    const named = thread.find((t) => t.peer_name)?.peer_name ?? null;
    const ordered = [...thread].reverse();

    return (
      <>
        <h2>💬 {named ?? peer}</h2>
        <p className="subtitle">
          <a href={`/dashboard/platform/telecallers-activity${qs({ rep: current.rep_id, days })}`}>
            ← Back to {current.rep_name || "this telecaller"}
          </a>
          {" · "}{peer} · {thread.length} messages · not a lead in {current.company_name.trim()}
        </p>
        {pErr && <div className="error">{pErr.message}</div>}

        {/* WHAT TO TELL THE REP, WITHOUT READING SIX MONTHS FIRST.
            A super admin opening a thread is deciding one thing: is this deal
            alive and what should the rep do next. Reading to the bottom to find
            out who spoke last is the slow way, so the three facts that decide it
            sit above the conversation — who spoke last, how long ago, and what
            the buyer's own words were flagged as. */}
        {(() => {
          const last = ordered[ordered.length - 1];
          if (!last) return null;
          const lastIn = [...ordered].reverse().find((x) => x.direction === "in");
          const waitingMins = lastIn && last.direction === "in"
            ? Math.floor((Date.now() - new Date(lastIn.sent_at).getTime()) / 60000)
            : 0;
          const hot = ordered.filter((x) => x.signal === "hot").length;
          const risk = ordered.filter((x) => x.signal === "risk").length;
          const owed = last.direction === "in";
          const human = waitingMins >= 1440
            ? `${Math.floor(waitingMins / 1440)} day${Math.floor(waitingMins / 1440) === 1 ? "" : "s"}`
            : waitingMins >= 60 ? `${Math.floor(waitingMins / 60)} hr` : `${waitingMins} min`;
          return (
            <div className="card" style={{
              marginBottom: 14, padding: 12,
              background: owed ? "rgba(239,68,68,0.08)" : "rgba(255,255,255,0.03)",
              border: `1px solid ${owed ? "rgba(239,68,68,0.28)" : "var(--border)"}`,
            }}>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center", fontSize: 13 }}>
                <span>
                  {owed
                    ? <><strong style={{ color: "#ef4444" }}>They spoke last</strong> — waiting {human}</>
                    : <><strong>Rep spoke last</strong> — ball is with the buyer</>}
                </span>
                {hot > 0 && <span style={{ color: "#22c55e" }}>🔥 {hot} buying signal{hot === 1 ? "" : "s"}</span>}
                {risk > 0 && <span style={{ color: "#ef4444" }}>⚠️ {risk} walk-away signal{risk === 1 ? "" : "s"}</span>}
                <span style={{ opacity: 0.7 }}>{ordered.length} messages</span>
              </div>
            </div>
          );
        })()}

        <WaThread messages={ordered} mediaUrl={purl} whoIn={named ?? peer} whoOut={current.rep_name || "Rep"} />

        {/* THE STEP THAT WAS MISSING. Finding these was only ever half of it:
            the list could point at thirty-four uncaptured relationships and
            then leave you to retype a phone number into another screen, losing
            the conversation that made it worth capturing. This creates the
            lead, assigns it to the rep, and brings the whole history with it. */}
        <div className="card" style={{ marginTop: 16, padding: 14 }}>
          <strong>Is this a buyer?</strong>
          <p className="subtitle" style={{ marginTop: 4, marginBottom: 10 }}>
            Then capture them. The lead is created in {current.company_name.trim()}, assigned to{" "}
            {current.rep_name || "this telecaller"}, and <strong>all {thread.length} messages above
            move onto the lead</strong> — so it opens with its history instead of blank. If they are
            already a lead, this adopts that one rather than making a second.
          </p>
          <form action={captureLead} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input type="hidden" name="rep" value={current.rep_id} />
            <input type="hidden" name="peer" value={peer} />
            <input type="hidden" name="days" value={String(days)} />
            <input name="name" placeholder="Their name (optional)" defaultValue={named ?? ""}
              style={{
                padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)",
                background: "rgba(255,255,255,0.02)", color: "var(--text)", minWidth: 220,
              }} />
            <button className="btn" type="submit">Add as lead</button>
          </form>
        </div>

        <p className="subtitle" style={{ marginTop: 14, fontSize: 12.5 }}>
          If it reads like a colleague or something personal, it is neither a buyer nor a problem —
          leave it. This list is a shortlist to judge, not a verdict.
        </p>
      </>
    );
  }

  // ── one rep's conversations, as evidence ──────────────────────────────────
  if (current) {
    // Grouped by lead and shown newest thread first. A flat list of 300 messages
    // is a log; grouped by who they were with, it is a conversation.
    const byLead = new Map<string, Msg[]>();
    for (const m of msgs) {
      if (!byLead.has(m.contact_id)) byLead.set(m.contact_id, []);
      byLead.get(m.contact_id)!.push(m);
    }
    return (
      <>
        <h2>👥 {current.rep_name || "Telecaller"} · {current.company_name.trim()}</h2>
        <p className="subtitle">
          <a href={`/dashboard/platform/telecallers-activity${qs({ days })}`}>← All telecallers</a>
          {" · "}{current.calls} calls, {fmtTalk(current.talk_seconds)} talk, {current.wa_messages} WhatsApp
          messages in {days} day{days === 1 ? "" : "s"}
        </p>
        {/* IS THIS EVEN THE RIGHT WHATSAPP?
            The question the product could not ask, and the reason a green
            "Connected" card sat next to empty lead pages for days. A rep whose
            linked number shares almost nothing with the leads they dial is not
            a rep doing nothing — they are on a different number. Re-scanning a
            QR cannot fix that, and until this line existed, re-scanning was the
            only thing anyone knew to try. */}
        {/* GIVING A REP THEIR OWN WORK BACK.
            Ankita lost WhatsApp off her own phone while we were asking her to
            re-scan for a bug re-scanning could not fix, and this database
            turned out to hold the only surviving copy of a year of her
            conversations. That should be one click, not a favour someone has
            to write SQL for. */}
        {current.wa_messages + current.wa_offbook > 0 && (
          <div className="card" style={{ marginBottom: 16, padding: 12 }}>
            <strong>📦 Download their WhatsApp archive</strong>
            <p className="subtitle" style={{ marginTop: 4, marginBottom: 8 }}>
              Every conversation this CRM has stored for {current.rep_name || "this telecaller"},
              as one file that opens on any phone — useful if they ever lose WhatsApp itself.
              Attachments are listed by name; the files were not captured before this week.
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <a className="btn" style={{ textDecoration: "none", display: "inline-block" }}
                href={`/dashboard/platform/telecallers-activity/export?rep=${current.rep_id}`}>
                Download as web page
              </a>
              {/* The same conversations in WhatsApp's own Export-chat layout.
                  Not a restore — WhatsApp has no import, from any file — but it
                  is the format every notes app and chat viewer already reads,
                  and it is what a rep can keep on their phone. */}
              <a className="btn-ghost" style={{ textDecoration: "none", display: "inline-block" }}
                href={`/dashboard/platform/telecallers-activity/export?rep=${current.rep_id}&format=txt`}>
                Download as WhatsApp .txt
              </a>
              {/* REBUILDING A CONTACT LIST IS A LIST JOB, NOT A READING JOB.
                  Nobody reconstructs a year of clients by scrolling a year of
                  chat. They sort the numbers by how much was said, look at what
                  each person opened with, and work down the list — which is a
                  spreadsheet, so here is one. */}
              <a className="btn-ghost" style={{ textDecoration: "none", display: "inline-block" }}
                href={`/dashboard/platform/telecallers-activity/export?rep=${current.rep_id}&format=clients`}>
                Excel: every number
              </a>
              <a className="btn-ghost" style={{ textDecoration: "none", display: "inline-block" }}
                href={`/dashboard/platform/telecallers-activity/export?rep=${current.rep_id}&format=csv`}>
                Excel: every message
              </a>
            </div>
            <p className="subtitle" style={{ marginTop: 8, marginBottom: 0, fontSize: 12 }}>
              The Excel files list every number, busiest first, with what the client
              first said and where the chat was left — names are usually blank
              because WhatsApp only sends a name for numbers saved in the phone.
            </p>
          </div>
        )}

        {fit && fit.numbers_whatsapped > 0 && fit.leads_called >= 20 &&
          fit.overlap * 20 < fit.leads_called && (
          <div className="card" style={{
            marginBottom: 16, padding: 14,
            background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.35)",
          }}>
            <strong style={{ color: "#f59e0b" }}>
              ⚠️ This WhatsApp is probably not the number they use for leads
            </strong>
            <p className="subtitle" style={{ marginTop: 6, marginBottom: 8 }}>
              They have called <strong>{fit.leads_called}</strong> of this company&apos;s leads, and
              talk to <strong>{fit.numbers_whatsapped}</strong> people on the linked WhatsApp
              {fit.wa_number ? ` (${fit.wa_number})` : ""} — but only <strong>{fit.overlap}</strong>
              {" "}of those are leads. Reps here often carry two numbers: the company SIM they dial
              from, and a WhatsApp Business on their own handset. Ask which number they message
              buyers on, and link that one.
            </p>
            <p className="subtitle" style={{ margin: 0, fontSize: 12.5 }}>
              Nothing is broken — the matching, the sync and the number format were all checked
              against this data. Re-scanning will not change this.
            </p>
            {fit.called_and_messaged > 0 && (
              <p style={{ marginTop: 10, marginBottom: 0, fontSize: 13 }}>
                💡 <strong>{fit.called_and_messaged}</strong> people here were both{" "}
                <strong>called and messaged</strong> by this rep and are <strong>not in the CRM
                at all</strong> — the likeliest uncaptured leads on the platform. They are at the
                top of the table below.
              </p>
            )}
          </div>
        )}

        {(current.wa_hot > 0 || current.wa_risk > 0) && (
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            {current.wa_risk > 0 && (
              <span style={{ padding: "4px 10px", borderRadius: 999, fontSize: 12.5, fontWeight: 600, background: "rgba(239,68,68,0.14)", color: "#ef4444" }}>
                ⚠️ {current.wa_risk} buyer message{current.wa_risk === 1 ? "" : "s"} read as about to walk
              </span>
            )}
            {current.wa_hot > 0 && (
              <span style={{ padding: "4px 10px", borderRadius: 999, fontSize: 12.5, fontWeight: 600, background: "rgba(34,197,94,0.14)", color: "#22c55e" }}>
                🔥 {current.wa_hot} buyer message{current.wa_hot === 1 ? "" : "s"} read as ready to move
              </span>
            )}
          </div>
        )}

        {byLead.size === 0 ? (
          <div className="empty">
            No WhatsApp conversations with this company&apos;s leads.
            {current.wa_watch === "none" && " Their WhatsApp is not connected — nothing is being watched."}
            {current.wa_watch === "stale" && " Their watcher has not reported in over two hours, so this is UNKNOWN rather than zero."}
            {current.wa_watch === "ok" && current.wa_offbook > 0 &&
              ` The watcher is working and saw ${current.wa_offbook} messages in this period, but none were with a number in your CRM.`}
          </div>
        ) : (
          [...byLead.entries()].map(([cid, thread]) => {
            const head = thread[0];
            // The RPC returns newest first; a conversation reads oldest first.
            const ordered = [...thread].reverse();
            return (
              <div className="card" key={cid} style={{ marginBottom: 16, padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                  <strong>{head.lead_name || head.lead_phone || "Lead"}</strong>
                  <span className="subtitle" style={{ fontSize: 12 }}>
                    {head.lead_phone}{head.stage ? ` · ${head.stage}` : ""} · {ordered.length} messages
                  </span>
                </div>
                <div style={{ marginTop: 12 }}>
                  <WaThread messages={ordered} mediaUrl={mediaUrl}
                    whoIn={head.lead_name || head.lead_phone || "Lead"}
                    whoOut={current.rep_name || "Rep"} />
                </div>
              </div>
            );
          })
        )}
        {/* THE NUMBERS BEHIND THE ZERO.
            "Saw 16 messages, none with a lead" was the end of the road — true,
            and useless. These are the numbers themselves. A buyer messaging a
            rep on a number nobody put in the CRM is a lead this company paid
            to generate and is now losing, and it was invisible until here. */}
        {unknown.length > 0 && (
          <>
            <h3 style={{ marginTop: 28, marginBottom: 4 }}>
              📵 Numbers that are not leads ({unknown.length})
            </h3>
            <p className="subtitle" style={{ marginTop: 0, marginBottom: 12 }}>
              Every number this rep has messaged that is not in the CRM — all of them, not just
              this week. <strong>Sorted by whether the rep also rang them</strong> — a
              number they both called and messaged is a real working relationship, and its absence
              from the CRM means the company would lose it the day that rep leaves.
            </p>
            <table className="table">
              <thead>
                <tr>
                  <th>Number</th>
                  <th>WhatsApp name</th>
                  <th style={{ textAlign: "right" }}>Also called</th>
                  <th style={{ textAlign: "right" }}>Messages</th>
                  <th style={{ textAlign: "right" }}>They sent</th>
                  <th>Last seen</th>
                </tr>
              </thead>
              <tbody>
                {unknown.map((u) => (
                  <tr key={u.peer_phone}>
                    <td style={{ fontFamily: "monospace" }}>
                      <a href={`/dashboard/platform/telecallers-activity${qs({ rep: current.rep_id, days, peer: u.peer_phone })}`}>
                        {u.peer_phone}
                      </a>
                    </td>
                    <td style={{ fontSize: 13 }}>
                      {u.peer_name || <span style={{ opacity: 0.4 }}>—</span>}
                    </td>
                    {/* Rang AND messaged, and still not in the CRM. That is a
                        working relationship living on one person's phone. */}
                    <td style={{ textAlign: "right" }}>
                      {u.calls > 0
                        ? <strong style={{ color: "#f59e0b" }}>{u.calls}×</strong>
                        : <span style={{ opacity: 0.3 }}>—</span>}
                    </td>
                    <td style={{ textAlign: "right" }}>{u.messages}</td>
                    {/* The half that matters. A number the rep messaged and that
                        never replied is noise; one that wrote BACK is a person. */}
                    <td style={{ textAlign: "right" }}>
                      {u.they_sent > 0
                        ? <strong style={{ color: "#22c55e" }}>{u.they_sent}</strong>
                        : <span style={{ opacity: 0.4 }}>0</span>}
                    </td>
                    <td className="subtitle" style={{ fontSize: 12.5, whiteSpace: "nowrap" }}>
                      {ago(u.last_seen)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {/* SELLING, OR PASTING?
            Nobody asks for this and every sales leader wants it. Message counts
            reward volume, so the rep who pastes one line to eighty numbers
            outranks the rep having six real conversations — on every other
            dashboard in this product. Distinct RECIPIENTS is what separates a
            blast from a rep legibly repeating themselves inside one thread,
            which is normal. */}
        {blasts.length > 0 && (
          <>
            <h3 style={{ marginTop: 28, marginBottom: 4 }}>📣 The same message, sent to many</h3>
            <p className="subtitle" style={{ marginTop: 0, marginBottom: 12 }}>
              Copy-pasted openers over the last {days} day{days === 1 ? "" : "s"}. Repeating an
              opener is normal selling — <strong>one that nobody ever replies to is not</strong>,
              and that is the column to read.
            </p>
            <table className="table">
              <thead>
                <tr>
                  <th>Message</th>
                  <th style={{ textAlign: "right" }}>People</th>
                  <th style={{ textAlign: "right" }}>Times</th>
                  <th style={{ textAlign: "right" }}>Replied</th>
                </tr>
              </thead>
              <tbody>
                {blasts.slice(0, 10).map((b, i) => {
                  const dead = b.replies_from === 0;
                  return (
                    <tr key={i}>
                      <td style={{ fontSize: 12.5, maxWidth: 420 }}>
                        {b.body.length > 120 ? `${b.body.slice(0, 119)}…` : b.body}
                      </td>
                      <td style={{ textAlign: "right" }}>{b.sent_to}</td>
                      <td style={{ textAlign: "right" }}>{b.times_sent}</td>
                      <td style={{ textAlign: "right" }}>
                        {dead
                          ? <strong style={{ color: "#ef4444" }}>0</strong>
                          : <strong style={{ color: "#22c55e" }}>{b.replies_from}</strong>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}

        <p className="subtitle" style={{ marginTop: 16, fontSize: 12.5 }}>
          These are company-allotted SIMs, so every conversation on them is kept — the ones with
          known leads appear as threads above, and any other number can be opened by clicking it.
          That is the point: a buyer messaging a company number who was never added to the CRM is
          a lead nobody wrote down, and it can only be recovered if someone can read it.
        </p>
      </>
    );
  }

  // ── the whole floor ───────────────────────────────────────────────────────
  const silent = rows.filter((r) => r.silent);
  const watched = rows.filter((r) => r.wa_watch !== "none").length;

  return (
    <>
      <h2>👥 Telecaller activity</h2>
      <p className="subtitle">
        Every telecaller in every company, <strong>least work first</strong>. Phone and WhatsApp
        in the same row — judging on one of them alone is how the busiest rep on the platform
        gets accused of doing nothing.
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "4px 0 14px" }}>
        {RANGES.map((d) => (
          <a key={d} href={`/dashboard/platform/telecallers-activity${qs({ days: d })}`} className="card"
            style={{
              padding: "6px 14px", textDecoration: "none",
              fontWeight: d === days ? 700 : 400,
              color: d === days ? "#fff" : "inherit",
              background: d === days ? "var(--accent, #4353B8)" : undefined,
            }}>
            {d === 1 ? "Today" : `${d} days`}
          </a>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
        <div className="card" style={{ flex: 1, minWidth: 160, padding: "14px 12px" }}>
          <div style={{ fontSize: 26, fontWeight: 700, color: silent.length ? "#ef4444" : undefined }}>
            {silent.length}/{rows.length}
          </div>
          <div className="subtitle" style={{ margin: 0, fontSize: 12 }}>
            nothing recorded in {days} day{days === 1 ? "" : "s"} — no call, no WhatsApp
          </div>
        </div>
        <div className="card" style={{ flex: 1, minWidth: 160, padding: "14px 12px" }}>
          <div style={{ fontSize: 26, fontWeight: 700 }}>{watched}/{rows.length}</div>
          <div className="subtitle" style={{ margin: 0, fontSize: 12 }}>
            on WhatsApp watching — the rest have no WhatsApp half to measure
          </div>
        </div>
      </div>

      <table className="table">
        <thead>
          <tr>
            <th>Telecaller</th>
            <th style={{ textAlign: "right" }}>Calls</th>
            <th style={{ textAlign: "right" }}>Talk</th>
            <th style={{ textAlign: "right" }}>WA msgs</th>
            <th style={{ textAlign: "right" }}>Got details ★</th>
            <th style={{ textAlign: "right" }}>Replied ★</th>
            <th>Signals</th>
            <th>WhatsApp</th>
            <th>Last call</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.rep_id}>
              <td>
                <a href={`/dashboard/platform/telecallers-activity${qs({ rep: r.rep_id, days })}`}>
                  <strong>{r.rep_name || "Telecaller"}</strong>
                </a>
                <div className="subtitle" style={{ fontSize: 12 }}>
                  {r.company_name.trim()} · {r.leads_assigned} leads
                  {!r.is_active && " · inactive account"}
                </div>
                {r.silent && (
                  <div style={{ color: "#ef4444", fontSize: 12, fontWeight: 600 }}>
                    Nothing recorded in {days} day{days === 1 ? "" : "s"}
                  </div>
                )}
              </td>
              <td style={{ textAlign: "right" }}>
                {r.calls === 0 ? <strong style={{ color: "#ef4444" }}>0</strong> : r.calls}
                {r.connected_calls > 0 && (
                  <div className="subtitle" style={{ fontSize: 12 }}>{r.connected_calls} got through</div>
                )}
              </td>
              <td style={{ textAlign: "right" }}>{r.talk_seconds ? fmtTalk(r.talk_seconds) : <span style={{ opacity: 0.3 }}>—</span>}</td>
              {/* Dashes, not zeros, when nobody is watching. An unknown printed
                  as a zero is the one thing these screens must never do. */}
              <td style={{ textAlign: "right" }}>
                {r.wa_watch === "ok" ? r.wa_messages : <span style={{ opacity: 0.3 }}>—</span>}
              </td>
              <td style={{ textAlign: "right" }}>
                {r.wa_watch === "ok" ? <strong>{r.wa_details}</strong> : <span style={{ opacity: 0.3 }}>—</span>}
              </td>
              <td style={{ textAlign: "right" }}>
                {r.wa_watch === "ok" ? <strong>{r.wa_replies}</strong> : <span style={{ opacity: 0.3 }}>—</span>}
              </td>
              <td style={{ fontSize: 12.5, whiteSpace: "nowrap" }}>
                {r.wa_risk > 0 && (
                  <div style={{ color: "#ef4444", fontWeight: 700 }}>⚠️ {r.wa_risk} about to walk</div>
                )}
                {r.wa_hot > 0 && (
                  <div style={{ color: "#22c55e", fontWeight: 700 }}>🔥 {r.wa_hot} ready to move</div>
                )}
                {r.wa_risk === 0 && r.wa_hot === 0 && <span style={{ opacity: 0.3 }}>—</span>}
              </td>
              <td style={{ fontSize: 12.5 }}>
                <span style={{ color: WATCH_TONE[r.wa_watch] }}>{WATCH_LABEL[r.wa_watch]}</span>
                {r.wa_watch === "ok" && r.wa_messages === 0 && r.wa_offbook > 0 && (
                  <div className="subtitle" style={{ fontSize: 12 }}>
                    {r.wa_offbook} seen, none with your leads
                  </div>
                )}
                {r.wa_calls > 0 && (
                  <div className="subtitle" style={{ fontSize: 12 }}>{r.wa_calls} WhatsApp calls</div>
                )}
              </td>
              <td className="subtitle" style={{ fontSize: 12.5 }}>{ago(r.last_call_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="subtitle" style={{ marginTop: 16, fontSize: 12.5 }}>
        Click a name to read their WhatsApp conversations with leads — the evidence behind the
        number. <strong>Nothing recorded</strong> means no call, no WhatsApp message and no
        WhatsApp call in the period; it is deliberately hard to earn.
      </p>
      <p className="subtitle" style={{ fontSize: 12.5 }}>
        A dash means <strong>not measured</strong>, not zero: that rep&apos;s WhatsApp is not
        connected, so their WhatsApp half is unknown and they should not be judged on it.
      </p>
      <p className="subtitle" style={{ fontSize: 12.5 }}>
        <strong>Signals</strong> read the buyer&apos;s own words for plain phrases — price/booking/site
        visit questions read as ready to move, cancel/competitor/too-expensive read as about to
        walk. It is a keyword read, not a verdict on the rep: open a name to see the actual message.
      </p>
    </>
  );
}
