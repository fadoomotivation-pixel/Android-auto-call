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
  const [hour, setHour] = useState(19);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from("pulse_subscribers")
      .select("*").eq("company_id", companyId).order("created_at");
    setSubs((data ?? []) as Sub[]);
  }, [supabase, companyId]);

  useEffect(() => { void load(); }, [load]);

  async function add() {
    const p = normalise(phone);
    if (p.length < 11) { setMsg("Enter a WhatsApp number with country code — e.g. 919876543210."); return; }
    setBusy(true); setMsg(null);
    // Same number twice is an update, not a second daily message to one phone.
    const { error } = await supabase.from("pulse_subscribers")
      .upsert({ company_id: companyId, phone: p, label: label.trim() || "Founder", send_hour_ist: hour, active: true },
        { onConflict: "company_id,phone" });
    setBusy(false);
    if (error) { setMsg(error.message); return; }
    setPhone(""); setOpen(false);
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
    else setMsg(`Sent to ${s.phone}${(data.parts ?? 1) > 1 ? ` in ${data.parts} messages` : ""}` +
      `${data.via === "template" ? " (as a template — the 24-hour window was closed)" : ""}` +
      `${data.borrowed_number ? " · sent from the platform number" : ""}.`);
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
            ? `Add the founder's number — this report goes out on its own, every evening.`
            : `${subs.filter((s) => s.active).length} number${subs.filter((s) => s.active).length === 1 ? "" : "s"} getting ${companyName ? `${companyName}'s` : "this"} report daily.`}
        </span>
        <button onClick={() => setOpen((o) => !o)}
          style={{ marginLeft: "auto", fontSize: 12, padding: "5px 12px", borderRadius: 7, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.05)", color: "var(--text)", cursor: "pointer" }}>
          {open ? "Cancel" : "+ Add number"}
        </button>
      </div>

      {open && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12, alignItems: "center" }}>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Founder" style={{ ...box, width: 110 }} />
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
            <strong>{s.label}</strong> · {s.phone}
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
          {s.last_sent_at && (
            <span style={{ fontSize: 12, color: s.last_status === "sent" ? "#22c55e" : "#f87171" }}>
              {s.last_status === "sent" ? "✓ Last sent" : "✗ Last try"}{" "}
              {new Date(s.last_sent_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
            </span>
          )}
          {/* The failure is almost always WhatsApp's 24-hour rule, and the fix
              is a specific thing the owner has to go and do. Printing it here,
              next to the number it happened to, is the difference between a
              feature they fix and one they quietly give up on. */}
          {s.last_status === "failed" && s.last_error && (
            <div style={{ flexBasis: "100%", fontSize: 12.5, color: "#fca5a5", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8, padding: "8px 10px", lineHeight: 1.5 }}>
              {s.last_error}
            </div>
          )}
        </div>
      ))}

      {msg && <div style={{ marginTop: 10, fontSize: 12.5, color: msg.startsWith("Sent") ? "#22c55e" : "#f87171" }}>{msg}</div>}
    </div>
  );
}
