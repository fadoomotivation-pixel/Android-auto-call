"use client";

import { useCallback, useEffect, useState } from "react";
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
 */
export function TelecallerWhatsApp({ companyId, reps }: { companyId: string; reps: Rep[] }) {
  const supabase = createClient();
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
  const [baseUrl, setBaseUrl] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: s }, { data: t }] = await Promise.all([
      supabase.from("wa_rep_sessions")
        .select("salesperson_id, base_url, status, wa_number, last_seen_at, last_error")
        .eq("company_id", companyId).returns<Session[]>(),
      supabase.from("v_rep_whatsapp_daily")
        .select("salesperson_id, messages_sent, leads_messaged, leads_given_details, leads_who_replied")
        .eq("company_id", companyId).eq("day_ist", istToday()).returns<Today[]>(),
    ]);
    setSessions(s ?? []);
    setToday(t ?? []);
    setLoading(false);
  }, [supabase, companyId]);

  useEffect(() => { void load(); }, [load]);

  const add = async () => {
    if (!repId) { setMsg("Pick a telecaller first."); return; }
    setBusy("add");
    setMsg(null);
    const { error } = await supabase.from("wa_rep_sessions").upsert({
      company_id: companyId,
      salesperson_id: repId,
      base_url: baseUrl.trim().replace(/\/+$/, "") || null,
      status: "disconnected",
    }, { onConflict: "salesperson_id" });
    setBusy(null);
    if (error) { setMsg(error.message); return; }
    setAdding(false); setRepId(""); setBaseUrl("");
    await load();
  };

  const remove = async (id: string) => {
    setBusy(id);
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
        Only messages to and from <strong>your own leads</strong> are saved. Anything else on
        the rep&apos;s phone — family, friends, personal chats — is dropped before it reaches
        the CRM. Tell them that before they scan.
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
                  <td style={{ textAlign: "right" }}>
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
          <label>
            Worker address
            <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://rep-name.yourhost.app" />
          </label>
          <p className="subtitle" style={{ fontSize: 12, marginTop: 0 }}>
            One worker per telecaller, each with its own login. The worker&apos;s secret is set
            on the worker itself and never typed here. After saving, open the worker&apos;s
            address and have the rep scan the QR from their own WhatsApp.
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
