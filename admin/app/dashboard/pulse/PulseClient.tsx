"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

type Rep = {
  id: string;
  name: string;
  calls: number;
  connected: number;
  talkSeconds: number;
  voiceNotes: { summary: string | null; lead: string; disposition: string | null; audioPath: string | null }[];
  moves: { detail: string; lead: string; byAi: boolean }[];
  siteVisits: string[];
  followUps: number;
  hotLeads: number;
  narrative?: string;
};
type Company = {
  company_id: string;
  company_name: string | null;
  date: string;
  totals: { calls: number; connected: number; notes: number; visits: number };
  reps: Rep[];
};

function istToday(): string {
  return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}
function fmtDur(sec: number): string {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
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

  // One telecaller's full day — shareable on its own ("har telecaller ka alag").
  function repReport(r: Rep, companyName?: string | null): string {
    const lines: string[] = [`📊 ${r.name} — Daily Pulse (${date})`];
    if (companyName) lines.push(`🏢 ${companyName}`);
    lines.push(
      `📞 ${r.calls} calls · ${r.connected} connected · ${fmtDur(r.talkSeconds)} talk` +
        (r.hotLeads > 0 ? ` · 🔥 ${r.hotLeads} hot` : ""),
    );
    if (r.narrative) lines.push(`\n✨ ${r.narrative}`);
    const notes = realNotes(r);
    if (notes.length) {
      lines.push(`\n🎤 Voice notes:`);
      notes.forEach((v) => lines.push(`• ${v.lead}: ${v.summary}`));
    }
    const moves = newsworthyMoves(r);
    if (moves.length) {
      lines.push(`\n🔄 Lead moves:`);
      moves.forEach((m) => lines.push(`• ${m.lead}: ${m.detail}${m.byAi ? " (AI)" : ""}`));
    }
    if (r.siteVisits.length) lines.push(`\n📍 Site visits: ${r.siteVisits.join(", ")}`);
    if (!r.calls && !notes.length && !moves.length && !r.siteVisits.length) {
      lines.push(`\nAaj koi activity nahi.`);
    }
    lines.push(`\n— via Call Pro AI`);
    return lines.join("\n");
  }

  function shareText(): string {
    const lines: string[] = [`📊 Daily Pulse — ${date}`];
    for (const c of companies) {
      if (isSuper && c.company_name) lines.push(`\n🏢 ${c.company_name}`);
      lines.push(`Team: ${c.totals.calls} calls · ${c.totals.connected} connected · ${c.totals.notes} voice notes · ${c.totals.visits} site visits`);
      for (const r of c.reps) {
        lines.push(`\n• ${r.name} — ${r.calls} calls, ${r.connected} connected, ${fmtDur(r.talkSeconds)} talk`);
        if (r.narrative) lines.push(`  ${r.narrative}`);
        realNotes(r).slice(0, 3).forEach((v) => lines.push(`  🎤 ${v.lead}: ${v.summary}`));
        newsworthyMoves(r).slice(0, 4).forEach((m) => lines.push(`  🔄 ${m.lead}: ${m.detail}`));
        if (r.siteVisits.length) lines.push(`  📍 Site visit: ${r.siteVisits.join(", ")}`);
      }
    }
    lines.push(`\n— via Call Pro AI`);
    return lines.join("\n");
  }

  async function copyReport() {
    await navigator.clipboard.writeText(shareText());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  function whatsappReport() {
    window.open(`https://wa.me/?text=${encodeURIComponent(shareText())}`, "_blank");
  }

  async function copyRep(r: Rep, companyName?: string | null) {
    await navigator.clipboard.writeText(repReport(r, companyName));
    setCopiedRep(r.id);
    setTimeout(() => setCopiedRep((id) => (id === r.id ? null : id)), 2000);
  }
  function whatsappRep(r: Rep, companyName?: string | null) {
    window.open(`https://wa.me/?text=${encodeURIComponent(repReport(r, companyName))}`, "_blank");
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
          {c.reps.length > 0 && (
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 14, color: "var(--muted)", fontSize: 13 }}>
              <span><strong style={{ color: "var(--text)" }}>{c.totals.calls}</strong> calls</span>
              <span><strong style={{ color: "#22c55e" }}>{c.totals.connected}</strong> connected</span>
              <span><strong style={{ color: "#8b5cf6" }}>{c.totals.notes}</strong> voice notes</span>
              <span><strong style={{ color: "#f59e0b" }}>{c.totals.visits}</strong> site visits</span>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 14 }}>
            {c.reps.map((r) => {
              const idle = !r.calls && !r.voiceNotes.length && !r.moves.length && !r.siteVisits.length;
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

                  {/* Stat strip */}
                  <div style={{ display: "flex", gap: 14, fontSize: 13, color: "var(--muted)", marginBottom: 10 }}>
                    <span><strong style={{ color: "var(--text)" }}>{r.calls}</strong> calls</span>
                    <span><strong style={{ color: "#22c55e" }}>{r.connected}</strong> conn.</span>
                    <span><strong style={{ color: "var(--text)" }}>{fmtDur(r.talkSeconds)}</strong> talk</span>
                  </div>

                  {/* AI narrative */}
                  {r.narrative && (
                    <div style={{ fontSize: 14, color: "var(--text)", background: "rgba(139,92,246,0.08)", padding: "10px 12px", borderRadius: 8, borderLeft: "3px solid #8b5cf6", marginBottom: 10 }}>
                      <strong style={{ color: "#c4b5fd" }}>✨ </strong>{r.narrative}
                    </div>
                  )}

                  {/* Voice notes — readable AND playable. The AI summary is a
                      summary; when the owner wants to judge the call for
                      themselves, the rep's own voice is the only real evidence. */}
                  {realNotes(r).slice(0, 3).map((v, i) => (
                    <div key={i} style={{ fontSize: 13, color: "var(--muted)", marginBottom: 6 }}>
                      <div>🎤 <strong style={{ color: "var(--text)" }}>{v.lead}:</strong> {v.summary}</div>
                      {v.audioPath && <VoiceNotePlayer path={v.audioPath} />}
                    </div>
                  ))}

                  {/* Pipeline moves (AI moves made from a voice note are already
                      described by that note above, so they aren't repeated). */}
                  {newsworthyMoves(r).slice(0, 5).map((m, i) => (
                    <div key={i} style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 4 }}>
                      {m.byAi ? "🤖" : "•"} <strong style={{ color: "var(--text)" }}>{m.lead}:</strong> {m.detail}
                    </div>
                  ))}
                  {r.siteVisits.length > 0 && (
                    <div style={{ fontSize: 12.5, color: "#f59e0b", marginTop: 6 }}>
                      📍 Site visit set: {r.siteVisits.join(", ")}
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
                      onClick={() => copyRep(r, c.company_name)}
                      style={{ flex: 1, fontSize: 12, padding: "6px 10px", borderRadius: 7, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.05)", color: "var(--text)", cursor: "pointer" }}
                    >
                      {copiedRep === r.id ? "✓ Copied" : "📋 Copy"}
                    </button>
                    <button
                      onClick={() => whatsappRep(r, c.company_name)}
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
