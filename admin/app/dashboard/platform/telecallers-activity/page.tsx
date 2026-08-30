import { createClient } from "@/lib/supabase/server";

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
  first_seen: string;
  last_seen: string;
};

const IST = { timeZone: "Asia/Kolkata" } as const;
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
  searchParams: { rep?: string; days?: string };
}) {
  const supabase = await createClient();
  const days = RANGES.includes(Number(searchParams.days) as 1 | 7 | 30)
    ? Number(searchParams.days) : 7;
  const rep = searchParams.rep || "";

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
  const mediaUrl = new Map<string, string>();
  if (current) {
    const [{ data: m }, { data: u }] = await Promise.all([
      supabase.rpc("super_rep_threads", { p_rep: current.rep_id, p_limit: 300 }),
      supabase.rpc("super_rep_unknown_numbers", { p_rep: current.rep_id, p_days: days }),
    ]);
    msgs = (m ?? []) as Msg[];
    unknown = (u ?? []) as UnknownRow[];

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

  const qs = (o: { rep?: string; days?: number }) => {
    const p = new URLSearchParams();
    if (o.rep) p.set("rep", o.rep);
    if (o.days && o.days !== 7) p.set("days", String(o.days));
    const s = p.toString();
    return s ? `?${s}` : "";
  };

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
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12 }}>
                  {ordered.map((m, i) => {
                    const mine = m.direction === "out";
                    // Only ever set on an incoming message (see the classifier
                    // trigger) — a buyer's own words, flagged, never the rep's.
                    const signalColor = m.signal === "risk" ? "#ef4444" : m.signal === "hot" ? "#22c55e" : null;
                    return (
                      <div key={i} style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start" }}>
                        <div style={{
                          maxWidth: "78%", padding: "8px 12px", borderRadius: 12,
                          background: signalColor ? `${signalColor}1f` : mine ? "rgba(16,185,129,0.12)" : "rgba(255,255,255,0.06)",
                          border: `1px solid ${signalColor ? `${signalColor}55` : mine ? "rgba(16,185,129,0.22)" : "rgba(255,255,255,0.08)"}`,
                        }}>
                          {m.signal && (
                            <div style={{ fontSize: 11, fontWeight: 700, color: signalColor ?? undefined, marginBottom: 3 }}>
                              {m.signal === "risk" ? "⚠️ reads as about to walk" : "🔥 reads as ready to move"}
                            </div>
                          )}
                          {/* DELETED, AND STILL HERE. "Delete for everyone"
                              used to leave the CRM believing the message still
                              stood. It is now marked and the original text is
                              shown — a rep taking back a price or a promise is
                              the thing this screen exists to make visible. */}
                          {m.deleted_at && (
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#ef4444", marginBottom: 3 }}>
                              🗑 Deleted by the rep · {new Date(m.deleted_at).toLocaleString("en-IN", {
                                ...IST, day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
                              })}
                            </div>
                          )}
                          {m.edited_at && !m.deleted_at && (
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#f59e0b", marginBottom: 3 }}>
                              ✏️ Edited
                            </div>
                          )}
                          {m.media_kind && (
                            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: m.body ? 4 : 0 }}>
                              {m.file_name ?? m.media_kind}
                              {m.duration_seconds ? ` · ${m.duration_seconds}s` : ""}
                              {m.shared_details && <span style={{ color: "#22c55e" }}> · details</span>}
                            </div>
                          )}
                          {/* The voice note itself, playable. This is how most
                              Indian real-estate reps actually talk to a buyer,
                              and it used to be stored as the word "audio". */}
                          {m.media_path && mediaUrl.get(m.media_path) && (
                            m.media_kind === "audio" ? (
                              <audio controls preload="none" src={mediaUrl.get(m.media_path)}
                                style={{ width: "100%", maxWidth: 260, marginBottom: 4 }} />
                            ) : m.media_kind === "image" ? (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img src={mediaUrl.get(m.media_path)} alt={m.file_name ?? "image"}
                                style={{ maxWidth: "100%", borderRadius: 8, marginBottom: 4 }} />
                            ) : (
                              <a href={mediaUrl.get(m.media_path)} target="_blank" rel="noreferrer"
                                style={{ fontSize: 12.5, display: "inline-block", marginBottom: 4 }}>
                                Open {m.file_name ?? m.media_kind}
                              </a>
                            )
                          )}
                          {m.body && (
                            <div style={{
                              fontSize: 14, whiteSpace: "pre-wrap", wordBreak: "break-word",
                              textDecoration: m.deleted_at ? "line-through" : undefined,
                              opacity: m.deleted_at ? 0.75 : 1,
                            }}>{m.body}</div>
                          )}
                          {/* What it said before it was changed. Only shown when
                              it actually differs — an edit that fixed a typo
                              does not need two lines of screen. */}
                          {m.body_original && m.body_original !== m.body && (
                            <div style={{ fontSize: 12.5, marginTop: 4, color: "var(--muted)" }}>
                              Originally: “{m.body_original}”
                            </div>
                          )}
                          {m.transcript && (
                            <div style={{ fontSize: 12.5, marginTop: 4, fontStyle: "italic", color: "var(--muted)" }}>
                              “{m.transcript}”
                            </div>
                          )}
                          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4, textAlign: "right" }}>
                            {new Date(m.sent_at).toLocaleString("en-IN", {
                              ...IST, day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
                            })}
                            {/* Unread inbound is a different failure from unanswered. */}
                            {!mine && !m.read_at && <span style={{ color: "#f59e0b" }}> · unread</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
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
              This rep messaged these in the last {days} day{days === 1 ? "" : "s"} and none of
              them is in the CRM. The busy ones are worth a look — a real buyer here is a lead
              nobody captured.
            </p>
            <table className="table">
              <thead>
                <tr>
                  <th>Number</th>
                  <th>WhatsApp name</th>
                  <th style={{ textAlign: "right" }}>Messages</th>
                  <th style={{ textAlign: "right" }}>They sent</th>
                  <th>Last seen</th>
                </tr>
              </thead>
              <tbody>
                {unknown.map((u) => (
                  <tr key={u.peer_phone}>
                    <td style={{ fontFamily: "monospace" }}>{u.peer_phone}</td>
                    <td style={{ fontSize: 13 }}>
                      {u.peer_name || <span style={{ opacity: 0.4 }}>—</span>}
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

        <p className="subtitle" style={{ marginTop: 16, fontSize: 12.5 }}>
          Conversations are shown for this company&apos;s leads. For any other number only the
          count and the name above are kept — never the messages.
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
