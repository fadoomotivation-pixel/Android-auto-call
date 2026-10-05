"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Stage } from "@/lib/dashboard/stage";
import { LeadFunnel } from "./LeadFunnel";
import { TEMPS, timeAgo } from "./leadView";

type VoiceNote = {
  id: string;
  actor_name: string | null;
  audio_path: string;
  duration_seconds: number;
  transcript: string | null;
  summary: string | null;
  suggested_disposition: string | null;
  ai_status: string;
  created_at: string;
  url?: string;
};

type WaMessage = {
  id: string;
  direction: "in" | "out";
  body: string | null;
  media_kind: string | null;
  shared_details: boolean;
  sent_at: string;
};

type CallLog = {
  id: string;
  outcome: string | null;
  duration_seconds: number | null;
  notes: string | null;
  summary: string | null;
  created_at: string;
};

type LeadRow = {
  id: string;
  name: string | null;
  phone: string;
  company_name: string | null;
  status: string | null;
  stage: string | null;
  salesperson_id: string | null;
  budget: string | null;
  territory: string | null;
  created_at: string;
  notes: string | null;
  temperature: string | null;
  last_contacted_at: string | null;
};

const MEDIA_LABEL: Record<string, string> = {
  document: "PDF",
  image: "Photo",
  video: "Video",
  audio: "Voice note",
  sticker: "Sticker",
  other: "Attachment",
};

function waWaiting(msgs: WaMessage[]): boolean {
  return msgs.length > 0 && msgs[msgs.length - 1].direction === "in";
}

function ist(iso: string, withTime: boolean) {
  return new Date(iso).toLocaleString("en-IN", withTime
    ? { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }
    : { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });
}

function words(code: string | null | undefined) {
  if (!code) return "—";
  return code.replace(/_/g, " ");
}

export function LeadHistory({
  contactId,
  onClose,
  stages,
  stagesFailed,
  stagesReady,
  assigneeName,
}: {
  contactId: string;
  onClose: () => void;
  stages: Stage[];
  stagesFailed: boolean;
  stagesReady: boolean;
  assigneeName: (id: string | null) => string;
}) {
  const [lead, setLead] = useState<LeadRow | null>(null);
  const [leadError, setLeadError] = useState<string | null>(null);
  const [logs, setLogs] = useState<CallLog[]>([]);
  const [notes, setNotes] = useState<VoiceNote[]>([]);
  const [wa, setWa] = useState<WaMessage[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  // Memoised because this is a dependency of the effect below. Unmemoised,
  // createClient() returns a new object per render, the effect re-runs, its
  // setState causes another render, and the sheet re-fetches forever.
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let off = false;
    async function load() {
      setLoading(true);
      const [leadRes, callsRes, notesRes, waRes] = await Promise.all([
        supabase
          .from("contacts")
          .select("id, name, phone, company_name, status, stage, salesperson_id, budget, territory, created_at, notes, temperature, last_contacted_at")
          .eq("id", contactId)
          .maybeSingle()
          .returns<LeadRow>(),
        supabase
          .from("call_logs")
          .select("id, outcome, duration_seconds, notes, summary, created_at")
          .eq("contact_id", contactId)
          .order("created_at", { ascending: false })
          .returns<CallLog[]>(),
        supabase
          .from("lead_voice_notes")
          .select("id, actor_name, audio_path, duration_seconds, transcript, summary, suggested_disposition, ai_status, created_at")
          .eq("contact_id", contactId)
          .order("created_at", { ascending: false }),
        supabase
          .from("wa_observed_messages")
          .select("id, direction, body, media_kind, shared_details, sent_at")
          .eq("contact_id", contactId)
          .order("sent_at", { ascending: true })
          .returns<WaMessage[]>(),
      ]);
      if (off) return;

      const nextProblems: string[] = [];
      if (leadRes.error) nextProblems.push(`Lead: ${leadRes.error.message}`);
      if (callsRes.error) nextProblems.push(`Calls: ${callsRes.error.message}`);
      if (notesRes.error) nextProblems.push(`Voice notes: ${notesRes.error.message}`);
      if (waRes.error) nextProblems.push(`WhatsApp: ${waRes.error.message}`);
      setProblems(nextProblems);
      setLeadError(leadRes.error ? leadRes.error.message : leadRes.data ? null : "This lead is not in the list you can see.");
      setLead(leadRes.data ?? null);
      setLogs(callsRes.error ? [] : (callsRes.data ?? []));
      setWa(waRes.error ? [] : (waRes.data ?? []));

      const vns = (notesRes.error ? [] : (notesRes.data as VoiceNote[]) || []);
      const signed = await Promise.all(
        vns.map(async (n) => {
          const { data, error } = await supabase.storage.from("voice-notes").createSignedUrl(n.audio_path, 3600);
          if (error) return { ...n, url: undefined };
          return { ...n, url: data?.signedUrl };
        }),
      );
      if (off) return;
      setNotes(signed);
      setLoading(false);
    }
    void load();
    return () => { off = true; };
  }, [contactId, supabase]);

  const temp = TEMPS.find((t) => t.code === lead?.temperature);
  const title = lead?.name || lead?.phone || "Lead";
  const historyEmpty = !loading && problems.length === 0 && logs.length === 0 && notes.length === 0 && wa.length === 0;

  return (
    <div className="lead-sheet-back" role="presentation" onClick={onClose}>
      <div
        className="lead-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lead-sheet-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="lead-sheet-bar">
          <div className="lead-sheet-heading">
            <div className="kicker">Lead</div>
            <h2 id="lead-sheet-title" className="keep-title">{loading && !lead ? "Loading…" : title}</h2>
            {lead && (
              <p className="lead-sheet-sub">
                {lead.phone}
                {lead.company_name ? ` · ${lead.company_name}` : ""}
              </p>
            )}
          </div>
          <button type="button" className="link" onClick={onClose}>Close</button>
        </header>

        <div className="lead-sheet-body">
          {leadError && <div className="error">{leadError}</div>}
          {problems.length > 0 && (
            <div className="error">
              {problems.map((p) => <div key={p}>{p}</div>)}
            </div>
          )}

          <section className="card lead-block">
            <div className="kicker">Where the deal is</div>
            <LeadFunnel stages={stages} current={lead?.stage ?? null} failed={stagesFailed} ready={stagesReady} />
          </section>

          {lead && (
            <section className="card lead-block">
              <div className="lead-facts">
                <Fact label="Phone" value={lead.phone} />
                <Fact label="Company" value={lead.company_name || "—"} />
                <Fact label="Territory" value={lead.territory || "—"} />
                <Fact label="Budget" value={lead.budget || "—"} />
                <Fact label="Assigned to" value={assigneeName(lead.salesperson_id)} />
                <Fact label="Temperature" value={temp?.label || (lead.temperature ? words(lead.temperature) : "—")} />
                <Fact label="Status" value={words(lead.status)} />
                <Fact label="Last contacted" value={lead.last_contacted_at ? `${ist(lead.last_contacted_at, true)} (${timeAgo(lead.last_contacted_at) ?? "—"})` : "—"} />
                <Fact label="Added" value={ist(lead.created_at, false)} />
              </div>
              <div className="lead-notes">
                <div className="kicker">Notes</div>
                <p>{lead.notes?.trim() ? lead.notes : "No notes."}</p>
              </div>
            </section>
          )}

          {loading && <div className="empty">Loading history…</div>}

          {!loading && wa.length > 0 && (
            <section className="card lead-block">
              <div className="kicker">
                WhatsApp
                {waWaiting(wa) && <span className="lead-wait">Buyer is waiting for a reply</span>}
              </div>
              <div className="lead-thread">
                {wa.map((m) => {
                  const mine = m.direction === "out";
                  return (
                    <div key={m.id} className={mine ? "lead-bubble mine" : "lead-bubble"}>
                      {m.media_kind && (
                        <div className="lead-bubble-media">
                          {MEDIA_LABEL[m.media_kind] ?? "Attachment"}
                          {m.shared_details && <span> · details</span>}
                        </div>
                      )}
                      {m.body && <div className="lead-bubble-body">{m.body}</div>}
                      <div className="lead-bubble-time">{ist(m.sent_at, true)}</div>
                    </div>
                  );
                })}
              </div>
              <p className="lead-fine">Only this lead&apos;s conversation is stored. The rep&apos;s other chats never reach the CRM.</p>
            </section>
          )}

          {!loading && notes.length > 0 && (
            <section className="card lead-block">
              <div className="kicker">Voice notes</div>
              <div className="lead-events">
                {notes.map((n) => (
                  <article key={n.id} className="lead-event">
                    <div className="lead-event-meta">
                      <span>{n.actor_name || "Telecaller"} · {ist(n.created_at, true)}</span>
                      <span>{n.duration_seconds}s</span>
                    </div>
                    {n.url ? (
                      <audio controls preload="none" src={n.url} />
                    ) : (
                      <div className="warn-line">Audio unavailable</div>
                    )}
                    {n.summary && (
                      <p className="lead-summary">
                        <strong>AI summary:</strong> {n.summary}
                        {n.suggested_disposition && (
                          <span className="status-pill" style={{ color: "var(--accent)", marginLeft: 8 }}>
                            suggests {n.suggested_disposition.replace(/_/g, " ")}
                          </span>
                        )}
                      </p>
                    )}
                    {n.transcript && (
                      <details>
                        <summary>Transcript</summary>
                        <p>{n.transcript}</p>
                      </details>
                    )}
                    {!n.summary && n.ai_status !== "failed" && (
                      <p className="lead-fine">AI summary processing…</p>
                    )}
                    {!n.summary && n.ai_status === "failed" && (
                      <p className="warn-line">AI summary failed.</p>
                    )}
                  </article>
                ))}
              </div>
            </section>
          )}

          {!loading && logs.length > 0 && (
            <section className="card lead-block">
              <div className="kicker">Calls</div>
              <div className="lead-events">
                {logs.map((l) => (
                  <article key={l.id} className="lead-event">
                    <div className="lead-event-meta">
                      <span>{ist(l.created_at, true)}</span>
                      <span>{l.duration_seconds == null ? "—" : `${l.duration_seconds} sec`}</span>
                    </div>
                    <span className={`badge ${l.outcome || "unknown"}`}>{l.outcome ? words(l.outcome) : "No outcome"}</span>
                    {l.notes && <p className="lead-summary"><strong>Telecaller notes:</strong> {l.notes}</p>}
                    {l.summary && <p className="lead-summary"><strong>AI summary:</strong> {l.summary}</p>}
                  </article>
                ))}
              </div>
            </section>
          )}

          {historyEmpty && <div className="empty">No calls or messages yet.</div>}
        </div>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="lead-fact">
      <div className="lead-fact-label">{label}</div>
      <div className="lead-fact-value">{value}</div>
    </div>
  );
}
