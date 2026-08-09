"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { AutoSend } from "./AutoSend";

type Rep = {
  id: string;
  name: string;
  calls: number;
  connected: number;
  talkSeconds: number;
  voiceNotes: { summary: string | null; lead: string; disposition: string | null; audioPath: string | null }[];
  moves: { detail: string; lead: string; byAi: boolean }[];
  /** Visit DATED today. A date is a promise, not attendance. */
  siteVisits: string[];
  /** False when this phone is not sending its call log — so calls/connected/
   *  talk below are what the CRM RECEIVED, not what the rep did. */
  callsTrusted?: boolean;
  /** Calls to numbers that are NOT CRM leads (record-all-calls). Never counted
   *  as work, never hidden — see offCrmLine in _shared/pulse.ts. */
  offCrmCalls?: number;
  offCrmTalkSeconds?: number;
  syncedAt?: string | null;
  /** Actually checked in on site today. The only evidence anyone came. */
  visitsArrived?: string[];
  followUps: number;
  hotLeads: number;
  narrative?: string;
  /** The decision half of the report, written server-side alongside the text
   *  so the page and the 7pm WhatsApp can never say different things. */
  visitsFixed?: number;
  bookings?: number;
  revenue?: number;
  win?: string;
  risk?: string;
  aiUpdates?: string[];
  nextSteps?: { lead: string; when: string; note: string | null }[];
  /** Ready-to-send wording, written server-side (see _shared/pulse.ts). */
  text?: string;
};
type Company = {
  company_id: string;
  company_name: string | null;
  date: string;
  totals: { calls: number; connected: number; notes: number; visits: number };
  reps: Rep[];
  /** Exactly what the 7pm WhatsApp will contain. */
  text?: string;
};

function istToday(): string {
  return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}
function fmtDur(sec: number): string {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
/** Indian money, the way it is read out loud. Mirrors the same helper in
 *  _shared/pulse.ts so the card and the WhatsApp format a figure identically. */
function rupees(n: number): string {
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(n % 10_000_000 === 0 ? 0 : 2)}Cr`;
  if (n >= 100_000) return `₹${(n / 100_000).toFixed(n % 100_000 === 0 ? 0 : 2)}L`;
  // Never a timeZone on a NUMBER's toLocaleString — Intl.NumberFormat rejects
  // it and the Vercel build fails.
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

/**
 * A voice note only belongs in a founder's update if it SAYS something. An
 * unprocessed or empty one is the filler that had to be deleted by hand before
 * forwarding.
 */
function realNotes(r: Rep) {
  return r.voiceNotes.filter((v) => {
    const t = (v.summary ?? "").trim();
    return t.length > 3 && !/^empty note$/i.test(t) && !/^\(processing\)$/i.test(t);
  });
}

/**
 * Pipeline moves the AI made FROM a voice note are already described by that
 * note's own line ("Sunil Yadav: not searching now ⚡ AI did: Marked cold"), so
 * printing them again just made the report longer to read and to trim.
 */
function newsworthyMoves(r: Rep) {
  return r.moves.filter((m) => !/\(from voice note\)/i.test(m.detail));
}

/**
 * Plays one voice note. The bucket is private, so the URL is signed on demand
 * and only when the owner actually asks to hear it — no signing a page full of
 * notes nobody plays. Cross-company playback needs the super-admin storage
 * policy from migration 0106; without it Supabase returns no URL and this says
 * so instead of showing a dead player.
 */
function VoiceNotePlayer({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setBusy(true);
    setErr(null);
    const supabase = createClient();
    const { data, error } = await supabase.storage.from("voice-notes").createSignedUrl(path, 3600);
    setBusy(false);
    if (error || !data?.signedUrl) {
      setErr("Couldn't open this recording.");
      return;
    }
    setUrl(data.signedUrl);
  }

  if (url) {
    return <audio controls src={url} style={{ width: "100%", height: 34, marginTop: 4 }} />;
  }
  return (
    <div style={{ marginTop: 4 }}>
      <button
        onClick={load}
        disabled={busy}
        style={{
          fontSize: 11.5, padding: "3px 10px", borderRadius: 999, cursor: busy ? "wait" : "pointer",
          border: "1px solid rgba(139,92,246,0.45)", background: "rgba(139,92,246,0.12)", color: "#c4b5fd",
        }}
      >
        {busy ? "Opening…" : "▶ Play voice note"}
      </button>
      {err && <span style={{ fontSize: 11.5, color: "var(--bad)", marginLeft: 8 }}>{err}</span>}
    </div>
  );
}

export function PulseClient({ isSuper }: { isSuper: boolean }) {
  const [date, setDate] = useState(istToday());
  const [companies, setCompanies] = useState<Company[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedRep, setCopiedRep] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { data, error } = await supabase.functions.invoke<{ ok: boolean; error?: string; companies?: Company[] }>(
      "team-pulse",
      { body: { date } },
    );
    setBusy(false);
    if (error || !data?.ok) {
      setError(data?.error || error?.message || "Couldn't build the pulse.");
      return;
    }
    setCompanies(data.companies || []);
  }, [date]);

  useEffect(() => { load(); }, [load]);

  /**
   * The wording is NOT written here any more.
   *
   * team-pulse returns the exact text pulse-broadcast will send at 7pm (both
   * come from _shared/pulse.ts), so "Copy report" and the automatic WhatsApp are
   * the same words. When this page wrote its own version, the two slowly drifted
   * and the founder ended up with a message that disagreed with the dashboard
   * they had just been reading.
   */
  function repReport(r: Rep): string {
    return r.text ?? "";
  }

  function shareText(): string {
    return companies.map((c) => c.text ?? "").filter(Boolean).join("\n\n");
  }

  async function copyReport() {
    await navigator.clipboard.writeText(shareText());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  function whatsappReport() {
    window.open(`https://wa.me/?text=${encodeURIComponent(shareText())}`, "_blank");
  }

  async function copyRep(r: Rep) {
    await navigator.clipboard.writeText(repReport(r));
    setCopiedRep(r.id);
    setTimeout(() => setCopiedRep((id) => (id === r.id ? null : id)), 2000);
  }
  function whatsappRep(r: Rep) {
    window.open(`https://wa.me/?text=${encodeURIComponent(repReport(r))}`, "_blank");
  }

  const anyReps = companies.some((c) => c.reps.length > 0);

  return (
    <div style={{ marginTop: 16 }}>
      {/* Controls */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 20 }}>
        <input
          type="date"
          value={date}
          max={istToday()}
          onChange={(e) => setDate(e.target.value)}
          style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)", background: "var(--panel)", color: "var(--text)" }}
        />
        <button className="primary" onClick={load} disabled={busy}>
          {busy ? "Building…" : "🔄 Refresh"}
        </button>
        <div style={{ flex: 1 }} />
        <button className="primary" style={{ background: "rgba(255,255,255,0.1)", color: "var(--text)" }} onClick={copyReport} disabled={!anyReps}>
          {copied ? "✓ Copied" : "📋 Copy report"}
        </button>
        <button className="primary" style={{ background: "#25D366", color: "#032b17" }} onClick={whatsappReport} disabled={!anyReps}>
          💬 WhatsApp
        </button>
      </div>

      {error && <div className="empty" style={{ color: "#f87171" }}>{error}</div>}

      {busy && companies.length === 0 && (
        <div className="empty">Aaj ka pulse ban raha hai — AI har telecaller ka din likh raha hai…</div>
      )}

      {!busy && !anyReps && !error && (
        <div className="empty">Is din koi telecaller activity nahi mili.</div>
      )}

      {companies.map((c) => (
        <div key={c.company_id} style={{ marginBottom: 28 }}>
          {isSuper && c.company_name && (
            <h3 style={{ margin: "0 0 6px", color: "#fff" }}>🏢 {c.company_name}</h3>
          )}
          {/* Per company, always — the super admin sets a customer's founder up
              the same way they set up their own, and a subscriber can only ever
              receive the company it sits under. */}
          <AutoSend companyId={c.company_id} companyName={c.company_name} />
          {c.reps.length > 0 && (
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 14, color: "var(--muted)", fontSize: 13 }}>
              <span><strong style={{ color: "var(--text)" }}>{c.totals.calls}</strong> calls</span>
              <span><strong style={{ color: "#22c55e" }}>{c.totals.connected}</strong> connected</span>
              {/* The totals are a sum of what ARRIVED. With a phone missing they
                  are a floor, not a count. */}
              {c.reps.some((r) => r.callsTrusted === false) && (
                <span style={{ color: "#fca5a5" }}>
                  ⚠️ incomplete — {c.reps.filter((r) => r.callsTrusted === false).map((r) => r.name).join(", ")} not reporting
                </span>
              )}
              <span><strong style={{ color: "#8b5cf6" }}>{c.totals.notes}</strong> voice notes</span>
              <span><strong style={{ color: "#f59e0b" }}>{c.totals.visits}</strong> site visits</span>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 14 }}>
            {c.reps.map((r) => {
              // Dimming the card says "this person did nothing". Never say that
              // about a phone that simply is not reporting.
              const idle = !r.calls && !(r.offCrmCalls ?? 0) && !r.voiceNotes.length && !r.moves.length &&
                !r.siteVisits.length && r.callsTrusted !== false;
              return (
                <div key={r.id} className="card" style={{ padding: 16, background: "var(--panel)", border: "1px solid rgba(255,255,255,0.08)", opacity: idle ? 0.65 : 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <strong style={{ color: "#fff", fontSize: 16 }}>{r.name}</strong>
                    {r.hotLeads > 0 && (
                      <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 999, background: "rgba(239,68,68,0.15)", color: "#fca5a5" }}>
                        🔥 {r.hotLeads} hot
                      </span>
                    )}
                  </div>

                  {/* Business first, dial count last — the same order as the
                      WhatsApp. A card that opens with calls is a call-centre
                      card, and the owner has to read to the bottom to find out
                      whether anything was actually sold. */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 14, fontSize: 13, color: "var(--muted)", marginBottom: 10 }}>
                    {(r.bookings ?? 0) > 0 && (
                      <span><strong style={{ color: "#22c55e" }}>🎉 {r.bookings}</strong> booked
                        {(r.revenue ?? 0) > 0 && <> · <strong style={{ color: "#22c55e" }}>{rupees(r.revenue!)}</strong></>}
                      </span>
                    )}
                    {(r.visitsFixed ?? 0) > 0 && (
                      <span><strong style={{ color: "#f59e0b" }}>📍 {r.visitsFixed}</strong> visits fixed</span>
                    )}
                    {/* A ZERO FROM A PHONE THAT IS NOT REPORTING IS NOT A ZERO.
                        This page kept printing "0 calls · 0 conn. · 0m talk"
                        beside "📍 3 visits fixed" — and those three visits came
                        from Ankita's own voice notes, so the calls demonstrably
                        happened. You cannot book a site visit on a call that
                        did not take place. The 3 was right and the 0 was the
                        broken number, and the founder had no way to tell which.
                        The WhatsApp report learned this in #385/#390; the page
                        renders the DATA rather than that text, so it never did. */}
                    {r.callsTrusted === false ? (
                      <span style={{ color: "#fca5a5" }}>
                        <strong>⚠️ calls not counted</strong> — phone not sending its call log
                      </span>
                    ) : r.calls === 0 && (r.offCrmCalls ?? 0) > 0 ? (
                      // A ROW OF ZEROS IS NOT A REPORT.
                      //
                      // "0 calls · 0 conn. · 0m talk" sat above "132 calls to
                      // numbers not in the CRM, 59m talk" on the same card, on a
                      // day this rep was on the phone for an hour. Both lines
                      // were true and together they read as a broken system —
                      // and a founder who has been told twice that the phone is
                      // fixed stops reading the card at the zero.
                      //
                      // When the only phone work was off-CRM, the real numbers
                      // ARE the headline, labelled for exactly what they are.
                      // The lead-work metric is not inflated: it is stated as
                      // "0 to CRM leads" in the same breath, so nobody can read
                      // 132 as 132 lead calls.
                      <>
                        <span><strong style={{ color: "var(--text)" }}>{r.offCrmCalls}</strong> calls</span>
                        <span><strong style={{ color: "var(--text)" }}>{fmtDur(r.offCrmTalkSeconds ?? 0)}</strong> talk</span>
                        <span style={{ color: "#fbbf24" }}><strong>0</strong> to CRM leads</span>
                      </>
                    ) : (
                      <>
                        <span><strong style={{ color: "var(--text)" }}>{r.calls}</strong> calls</span>
                        <span><strong style={{ color: "#22c55e" }}>{r.connected}</strong> conn.</span>
                        <span><strong style={{ color: "var(--text)" }}>{fmtDur(r.talkSeconds)}</strong> talk</span>
                      </>
                    )}
                  </div>

                  {/* Phone time that is not lead work, said out loud.
                      Ankita's card read "0 calls · 0 conn. · 0m talk" on a day
                      she spent 45 minutes on the phone across 33 calls — every
                      one to a number that is not in the CRM. By the work rule
                      the zero is correct, and a founder reading it concludes
                      the phone is broken again or that she did nothing. The
                      true and useful reading is the third one: she is working,
                      just not our leads. Kept OUT of the KPI row on purpose —
                      this must never inflate the numbers the business judges. */}
                  {(r.offCrmCalls ?? 0) > 0 && (
                    <div style={{
                      fontSize: 13, color: "#fbbf24", marginBottom: 10,
                      background: "rgba(251,191,36,0.08)",
                      border: "1px solid rgba(251,191,36,0.25)",
                      borderRadius: 10, padding: "8px 12px",
                    }}>
                      📵 These numbers are <strong>not in the CRM</strong>
                      {r.calls === 0
                        ? " — every call today was to someone the CRM has never heard of. Import them as leads and the AI coach can work them."
                        : <>: <strong>{r.offCrmCalls}</strong> call{r.offCrmCalls === 1 ? "" : "s"}
                            {(r.offCrmTalkSeconds ?? 0) > 0 && <>, <strong>{fmtDur(r.offCrmTalkSeconds ?? 0)}</strong> talk</>}
                          </>}
                    </div>
                  )}

                  {/* What DID arrive, so the founder can still see the day. These
                      reach the server straight from the app and were never in
                      doubt — unlike the call log, which needs a background
                      worker the OEM is free to kill. */}
                  {r.callsTrusted === false && (
                    <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 10 }}>
                      Recorded by hand today:{" "}
                      <strong style={{ color: "var(--text)" }}>
                        {[
                          r.voiceNotes.length > 0 ? `${r.voiceNotes.length} voice notes` : null,
                          r.moves.length > 0 ? `${r.moves.length} lead updates` : null,
                        ].filter(Boolean).join(" · ") || "nothing"}
                      </strong>
                      {" — "}
                      <a href="/dashboard/health" style={{ color: "var(--accent)" }}>fix the phone →</a>
                    </div>
                  )}

                  {/* The win and the risk — the two things a founder cannot get
                      from the numbers. `narrative` is the older single-blob
                      version and only shows on days the new fields are absent,
                      so an un-redeployed function still renders something. */}
                  {r.win && (
                    <div style={{ fontSize: 14, color: "var(--text)", background: "rgba(34,197,94,0.08)", padding: "9px 12px", borderRadius: 8, borderLeft: "3px solid #22c55e", marginBottom: 8 }}>
                      <strong style={{ color: "#86efac" }}>✅ </strong>{r.win}
                    </div>
                  )}
                  {r.risk && (
                    <div style={{ fontSize: 14, color: "var(--text)", background: "rgba(245,158,11,0.08)", padding: "9px 12px", borderRadius: 8, borderLeft: "3px solid #f59e0b", marginBottom: 8 }}>
                      <strong style={{ color: "#fcd34d" }}>⚠️ </strong>{r.risk}
                    </div>
                  )}
                  {!r.win && !r.risk && r.narrative && (
                    <div style={{ fontSize: 14, color: "var(--text)", background: "rgba(139,92,246,0.08)", padding: "10px 12px", borderRadius: 8, borderLeft: "3px solid #8b5cf6", marginBottom: 10 }}>
                      <strong style={{ color: "#c4b5fd" }}>✨ </strong>{r.narrative}
                    </div>
                  )}

                  {/* What is booked next — the half of the report that can still
                      be acted on. The day's numbers are history by 7pm. */}
                  {(r.nextSteps ?? []).slice(0, 3).map((s, i) => (
                    <div key={i} style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 3 }}>
                      🎯 <strong style={{ color: "var(--text)" }}>{s.lead}</strong> — {s.when}
                    </div>
                  ))}

                  {/* What the AI did, counted. This used to be one line per
                      automatic action, so four unanswered calls printed four
                      identical "Marked cold" rows and one lead that got two
                      callbacks a minute apart printed both. */}
                  {(r.aiUpdates ?? []).map((u, i) => (
                    <div key={i} style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 3 }}>🤖 {u}</div>
                  ))}

                  {/* The evidence, behind a click.
                      Voice notes and the lead-move log are the reason this page
                      exists rather than just forwarding the WhatsApp — but they
                      are what a manager opens to check a specific call, not what
                      a founder reads first. Collapsed, they stop being the forty
                      lines you scroll past to reach the decision. */}
                  {(realNotes(r).length > 0 || newsworthyMoves(r).length > 0) && (
                    <details style={{ marginTop: 10 }}>
                      <summary style={{ fontSize: 12, color: "var(--muted)", cursor: "pointer" }}>
                        Call detail — {realNotes(r).length} voice {realNotes(r).length === 1 ? "note" : "notes"}, {newsworthyMoves(r).length} lead {newsworthyMoves(r).length === 1 ? "move" : "moves"}
                      </summary>
                      <div style={{ marginTop: 8 }}>
                        {realNotes(r).slice(0, 5).map((v, i) => (
                          <div key={i} style={{ fontSize: 13, color: "var(--muted)", marginBottom: 6 }}>
                            <div>🎤 <strong style={{ color: "var(--text)" }}>{v.lead}:</strong> {v.summary}</div>
                            {v.audioPath && <VoiceNotePlayer path={v.audioPath} />}
                          </div>
                        ))}
                        {newsworthyMoves(r).slice(0, 8).map((m, i) => (
                          <div key={i} style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 4 }}>
                            {m.byAi ? "🤖" : "•"} <strong style={{ color: "var(--text)" }}>{m.lead}:</strong> {m.detail}
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                  {/* "Visit today" meant a DATE, and read as an attendance.
                      The two are split here for the same reason the WhatsApp
                      report now splits them: on 6 Aug a lead with a 4pm slot he
                      never showed up to was reported to the founder as having
                      visited. Green is someone who came; amber is someone who
                      said they would. */}
                  {(r.visitsArrived ?? []).length > 0 && (
                    <div style={{ fontSize: 12.5, color: "#16a34a", marginTop: 6 }}>
                      ✅ Came to site: {(r.visitsArrived ?? []).join(", ")}
                    </div>
                  )}
                  {r.siteVisits.filter((v) => !(r.visitsArrived ?? []).includes(v)).length > 0 && (
                    <div style={{ fontSize: 12.5, color: "#f59e0b", marginTop: 6 }}>
                      📍 Due at site today, arrival not confirmed:{" "}
                      {r.siteVisits.filter((v) => !(r.visitsArrived ?? []).includes(v)).join(", ")}
                    </div>
                  )}

                  {/* Silence has two very different causes, and this page can't
                      tell them apart: someone who didn't work, or a phone that
                      stopped feeding the CRM. Phone Health knows which. */}
                  {idle && (
                    <div style={{ fontSize: 13, color: "var(--muted)" }}>
                      No activity today.{" "}
                      <a href="/dashboard/health" style={{ color: "var(--accent)" }}>
                        Phone working? →
                      </a>
                    </div>
                  )}

                  {/* Per-telecaller share — send THIS rep's day on its own. */}
                  <div style={{ display: "flex", gap: 8, marginTop: 12, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                    <button
                      onClick={() => copyRep(r)}
                      style={{ flex: 1, fontSize: 12, padding: "6px 10px", borderRadius: 7, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.05)", color: "var(--text)", cursor: "pointer" }}
                    >
                      {copiedRep === r.id ? "✓ Copied" : "📋 Copy"}
                    </button>
                    <button
                      onClick={() => whatsappRep(r)}
                      style={{ flex: 1, fontSize: 12, padding: "6px 10px", borderRadius: 7, border: "none", background: "#25D366", color: "#032b17", fontWeight: 600, cursor: "pointer" }}
                    >
                      💬 WhatsApp
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
