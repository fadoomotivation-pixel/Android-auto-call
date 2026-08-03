"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * "Put the founder's number in and the report goes out at 7 every evening."
 *
 * This card is per company, and deliberately so: a subscriber belongs to ONE
 * company and only ever receives that company's pulse. For the super admin the
 * card appears under each company on the page, so setting one up for a customer
 * is the same three fields as setting one up for their own team — no separate
 * screen, no cross-company list to pick the wrong row out of.
 *
 * "Send now" exists because an automation you cannot test until 7pm tomorrow is
 * an automation nobody switches on. It sends the real report to the real number
 * through the real path, so a success here means tonight will work.
 */

type Sub = {
  id: string;
  company_id: string;
  label: string;
  phone: string;
  send_hour_ist: number;
  /** Null = the founder, who gets the whole team's roll-up. Set = one
   *  telecaller, who gets their own day and nobody else's numbers. */
  salesperson_id: string | null;
  active: boolean;
  template_name: string | null;
  last_sent_at: string | null;
  last_status: string | null;
  last_error: string | null;
};

/** Digits only, and India's country code added for a bare 10-digit number. */
function normalise(raw: string): string {
  const d = (raw ?? "").replace(/\D/g, "");
  return d.length === 10 ? `91${d}` : d;
}

/**
 * What we are actually allowed to claim.
 *
 * A 200 from Meta means "accepted" — it has taken the message and given it an
 * id, nothing more. Whether it may be handed over is decided afterwards and
 * announced only in a status webhook, so "delivered" and "read" are the only
 * two words here that prove a phone buzzed. Everything else is a stage, and
 * showing it as one is the difference between a founder who knows to go and
 * fix something and a founder who trusts a tick and never gets the report.
 */
function verdict(status: string | null): { label: string; color: string; hint: string } {
  switch (status) {
    case "read":
      return { label: "✓✓ Read", color: "#22c55e", hint: "They opened it." };
    case "delivered":
      return { label: "✓✓ Delivered", color: "#22c55e", hint: "It reached their phone." };
    case "sent":
      return { label: "✓ Sent by WhatsApp", color: "#4ade80", hint: "WhatsApp has sent it on; delivery not confirmed yet." };
    case "accepted":
      return { label: "· Handed to WhatsApp", color: "#fbbf24", hint: "Meta accepted it. Delivery is not confirmed." };
    // Not a failure, and shown as its own thing so nobody chases a report that
    // is about to arrive on its own. The drain cron runs every five minutes.
    case "queued":
      return { label: "⏳ Waiting to send", color: "#60a5fa", hint: "WhatsApp was down. It is held and retried automatically." };
    case "failed":
      return { label: "✗ Failed", color: "#f87171", hint: "WhatsApp refused to deliver it." };
    default:
      return { label: "· Last try", color: "#9ca3af", hint: "No result recorded." };
  }
}

function hourLabel(h: number): string {
  const ampm = h < 12 ? "AM" : "PM";
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return `${twelve}:00 ${ampm}`;
}

export function AutoSend({ companyId, companyName }: { companyId: string; companyName?: string | null }) {
  const supabase = createClient();
  const [subs, setSubs] = useState<Sub[]>([]);
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [label, setLabel] = useState("Founder");
  // "" = the founder (whole team). Otherwise a telecaller's profile id.
  const [who, setWho] = useState("");
  const [reps, setReps] = useState<{ id: string; full_name: string | null }[]>([]);
  const [hour, setHour] = useState(19);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [{ data }, { data: rs }] = await Promise.all([
      supabase.from("pulse_subscribers").select("*").eq("company_id", companyId).order("created_at"),
      supabase.from("profiles").select("id, full_name")
        .eq("company_id", companyId).eq("role", "salesperson").order("full_name"),
    ]);
    setSubs((data ?? []) as Sub[]);
    setReps((rs ?? []) as { id: string; full_name: string | null }[]);
  }, [supabase, companyId]);

  useEffect(() => { void load(); }, [load]);

  async function add() {
    const p = normalise(phone);
    if (p.length < 11) { setMsg("Enter a WhatsApp number with country code — e.g. 919876543210."); return; }
    setBusy(true); setMsg(null);
    // Same number twice is an update, not a second daily message to one phone.
    const repName = reps.find((r) => r.id === who)?.full_name ?? "Telecaller";
    const { error } = await supabase.from("pulse_subscribers")
      .upsert({
        company_id: companyId, phone: p,
        // A rep row labels itself, because "Founder" sitting next to a
        // telecaller's number is how the wrong person gets the team's figures.
        label: who ? repName : (label.trim() || "Founder"),
        salesperson_id: who || null,
        send_hour_ist: hour, active: true,
      }, { onConflict: "company_id,phone,salesperson_id" });
    setBusy(false);
    if (error) { setMsg(error.message); return; }
    setPhone(""); setWho(""); setOpen(false);
    void load();
  }

  async function patch(id: string, changes: Partial<Sub>) {
    await supabase.from("pulse_subscribers").update(changes).eq("id", id);
    void load();
  }

  async function remove(id: string) {
    await supabase.from("pulse_subscribers").delete().eq("id", id);
    void load();
  }

  async function sendNow(s: Sub) {
    setSendingId(s.id); setMsg(null);
    const { data, error } = await supabase.functions.invoke<{ ok: boolean; error?: string; via?: string; parts?: number; borrowed_number?: boolean }>(
      "pulse-broadcast", { body: { subscriber_id: s.id } },
    );
    setSendingId(null);
    if (error || !data?.ok) setMsg(data?.error || error?.message || "Couldn't send.");
    // Not "Sent to" — we only know WhatsApp accepted it. Saying more than that
    // is what made tonight's silent failure look like a success.
    else setMsg(`Handed to WhatsApp for ${s.phone}${(data.parts ?? 1) > 1 ? ` in ${data.parts} messages` : ""}` +
      `${data.via === "template" ? " (as a template — the 24-hour window was closed)" : ""}` +
      `${data.borrowed_number ? " · from the platform number" : ""}. ` +
      `Check the phone — if nothing arrives, WhatsApp refused it and the reason will show here shortly.`);
    void load();
  }

  const box: React.CSSProperties = {
    padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)",
    background: "var(--panel)", color: "var(--text)", fontSize: 13,
  };

  return (
    <div style={{ border: "1px solid rgba(37,211,102,0.3)", background: "rgba(37,211,102,0.05)", borderRadius: 12, padding: 14, marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <strong style={{ color: "#fff", fontSize: 14 }}>💬 Send this to WhatsApp automatically</strong>
        <span style={{ fontSize: 12.5, color: "var(--muted)" }}>
          {subs.length === 0
            ? `Add a number — the founder gets the whole team, a telecaller gets only their own day. Goes out on its own, every evening.`
            : `${subs.filter((s) => s.active).length} number${subs.filter((s) => s.active).length === 1 ? "" : "s"} getting ${companyName ? `${companyName}'s` : "this"} report daily.`}
        </span>
        <button onClick={() => setOpen((o) => !o)}
          style={{ marginLeft: "auto", fontSize: 12, padding: "5px 12px", borderRadius: 7, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.05)", color: "var(--text)", cursor: "pointer" }}>
          {open ? "Cancel" : "+ Add number"}
        </button>
      </div>

      {open && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12, alignItems: "center" }}>
          {/* WHO first, because it changes what the report is. Founder = the
              whole team's roll-up; a telecaller = that one person's own day and
              nobody else's numbers. Without this there was literally nowhere to
              type a rep's number, so the only way a rep saw their own report
              was a manager forwarding it by hand. */}
          <select value={who} onChange={(e) => setWho(e.target.value)} style={{ ...box, width: 190 }}>
            <option value="">👑 Founder — whole team</option>
            {reps.map((r) => (
              <option key={r.id} value={r.id}>👤 {r.full_name || "Telecaller"} — own report</option>
            ))}
          </select>
          {!who && (
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Founder" style={{ ...box, width: 110 }} />
          )}
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="9876543210" inputMode="tel" style={{ ...box, width: 170 }} />
          <select value={hour} onChange={(e) => setHour(Number(e.target.value))} style={box}>
            {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
          </select>
          <button className="primary" onClick={add} disabled={busy} style={{ background: "#25D366", color: "#032b17" }}>
            {busy ? "Saving…" : "Save"}
          </button>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>Indian numbers: 10 digits is enough, 91 is added for you.</span>
        </div>
      )}

      {subs.map((s) => (
        <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <span style={{ fontSize: 13, color: "var(--text)" }}>
            <strong>{s.salesperson_id ? "👤" : "👑"} {s.label}</strong> · {s.phone}
            <span style={{ color: "var(--muted)", fontSize: 12 }}>
              {" "}· {s.salesperson_id ? "own report" : "whole team"}
            </span>
          </span>
          <select value={s.send_hour_ist} onChange={(e) => patch(s.id, { send_hour_ist: Number(e.target.value) })} style={box}>
            {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
          </select>
          <label style={{ fontSize: 12.5, color: "var(--muted)", display: "flex", alignItems: "center", gap: 5 }}>
            <input type="checkbox" checked={s.active} onChange={(e) => patch(s.id, { active: e.target.checked })} />
            On
          </label>
          <button onClick={() => sendNow(s)} disabled={sendingId === s.id}
            style={{ fontSize: 12, padding: "5px 12px", borderRadius: 7, border: "none", background: "#25D366", color: "#032b17", fontWeight: 600, cursor: "pointer" }}>
            {sendingId === s.id ? "Sending…" : "Send now"}
          </button>
          <button onClick={() => remove(s.id)}
            style={{ fontSize: 12, padding: "5px 10px", borderRadius: 7, border: "1px solid rgba(255,255,255,0.12)", background: "transparent", color: "var(--muted)", cursor: "pointer" }}>
            Remove
          </button>
          {s.last_sent_at && (() => {
            const v = verdict(s.last_status);
            return (
              <span style={{ fontSize: 12, color: v.color }} title={v.hint}>
                {v.label}{" "}
                {new Date(s.last_sent_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
              </span>
            );
          })()}
          {/* "Handed to WhatsApp" is not "arrived", and saying so is the whole
              point. A green tick over a report that never reached the phone is
              worse than no tick — the founder stops checking, and nobody finds
              out for a week. This line stays amber until WhatsApp itself says
              delivered. */}
          {s.last_status === "accepted" && (
            <div style={{ flexBasis: "100%", fontSize: 12.5, color: "#fcd34d", lineHeight: 1.5 }}>
              WhatsApp took this message but hasn&apos;t confirmed it reached the phone. If it didn&apos;t
              arrive, it&apos;s almost always the 24-hour rule: ask them to send any message to your
              WhatsApp business number, then press Send now again.
            </div>
          )}
          {/* The failure is almost always WhatsApp's 24-hour rule, and the fix
              is a specific thing the owner has to go and do. Printing it here,
              next to the number it happened to, is the difference between a
              feature they fix and one they quietly give up on. */}
          {s.last_status === "queued" && (
            <div style={{ flexBasis: "100%", fontSize: 12.5, color: "#93c5fd", lineHeight: 1.5 }}>
              WhatsApp wasn&apos;t reachable, so this report is being held and retried every few minutes.
              {s.last_error ? ` (${s.last_error})` : ""}
            </div>
          )}
          {s.last_status === "failed" && s.last_error && (
            <div style={{ flexBasis: "100%", fontSize: 12.5, color: "#fca5a5", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8, padding: "8px 10px", lineHeight: 1.5 }}>
              {s.last_error}
            </div>
          )}
        </div>
      ))}

      {msg && <div style={{ marginTop: 10, fontSize: 12.5, color: msg.startsWith("Handed") ? "#fbbf24" : "#f87171" }}>{msg}</div>}
    </div>
  );
}
