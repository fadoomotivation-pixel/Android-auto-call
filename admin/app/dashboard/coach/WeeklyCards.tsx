"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { createClient } from "@/lib/supabase/client";
import { ist } from "@/lib/dashboard/format";
import { RepPersona } from "./RepPersona";

type Rep = {
  salesperson_id: string;
  full_name: string | null;
  company_id: string;
  company_name: string | null;
  has_phone: boolean;
  phone_tail: string | null;
  company_on: boolean;
  recorded_calls: number;
  built_at: string | null;
  sent_at: string | null;
};

type List = { ok: boolean; error?: string; week_from: string; week_to: string; monday_on: boolean; reps: Rep[] };

/** Below this the card is numbers only — feedback from one or two calls would not be fair. */
const MIN_FOR_FEEDBACK = 3;

const shortDate = (d: string) =>
  new Date(`${d}T00:00:00+05:30`).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });

/**
 * The Monday report card, from the founder's side.
 *
 * Each telecaller gets their week on WhatsApp: the numbers, two things they did
 * well and two to do better — taken from their own recorded calls, each one
 * tied to a real buyer and day. Preview builds the card once and keeps it, so
 * what the founder reads here is word for word what the rep receives.
 *
 * Every row says why it will or will not get feedback, because "no card" with
 * no reason is the thing a founder stops trusting.
 */
export function WeeklyCards({ isSuper, initialCompanyId = null }: { isSuper: boolean; initialCompanyId?: string | null }) {
  const supabase = createClient();
  const [list, setList] = useState<List | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [company, setCompany] = useState(initialCompanyId || "all");
  const [open, setOpen] = useState<string | null>(null);
  const [preview, setPreview] = useState<Record<string, { text: string | null; note: string | null }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [msg, setMsg] = useState<Record<string, { ok: boolean; text: string }>>({});

  const load = useCallback(async () => {
    setErr(null);
    const { data, error } = await supabase.functions.invoke<List>("rep-week-review", {
      body: { mode: "list", company_id: initialCompanyId },
    });
    if (error || !data?.ok) { setErr(data?.error || error?.message || "Couldn't load the telecallers."); setList(null); return; }
    setList(data);
  }, [supabase, initialCompanyId]);

  useEffect(() => { void load(); }, [load]);

  const companies = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of list?.reps ?? []) m.set(r.company_id, (r.company_name ?? "Company").trim());
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [list]);
  const shown = (list?.reps ?? []).filter((r) => company === "all" || r.company_id === company);

  async function showCard(r: Rep, rebuild = false) {
    setOpen(r.salesperson_id);
    if (preview[r.salesperson_id] && !rebuild) return;
    setBusy(r.salesperson_id);
    const { data, error } = await supabase.functions.invoke<{ ok: boolean; error?: string; preview?: string | null; note?: string | null }>(
      "rep-week-review", { body: { mode: "preview", salesperson_id: r.salesperson_id, rebuild } },
    );
    setBusy(null);
    setPreview((p) => ({
      ...p,
      [r.salesperson_id]: error || !data?.ok
        ? { text: null, note: data?.error || error?.message || "Couldn't build the card." }
        : { text: data.preview ?? null, note: data.note ?? null },
    }));
    void load();
  }

  async function send(r: Rep) {
    setConfirm(null);
    setBusy(r.salesperson_id);
    const { data, error } = await supabase.functions.invoke<{ ok: boolean; error?: string; queued?: boolean }>(
      "rep-week-review", { body: { mode: "send", salesperson_id: r.salesperson_id } },
    );
    setBusy(null);
    setMsg((m) => ({
      ...m,
      [r.salesperson_id]: error || !data?.ok
        ? { ok: false, text: data?.error || error?.message || "Couldn't send." }
        : { ok: true, text: data.queued ? "WhatsApp is down. It is held and will go out in a few minutes." : "Handed to WhatsApp." },
    }));
    void load();
  }

  async function switchMonday(on: boolean) {
    const { data, error } = await supabase.functions.invoke<{ ok: boolean; error?: string }>(
      "rep-week-review", { body: { mode: "switch", on } },
    );
    if (error || !data?.ok) setErr(data?.error || error?.message || "Couldn't change it.");
    void load();
  }

  const card: CSSProperties = {
    border: "1px solid var(--border)", borderRadius: 12, padding: "12px 14px", marginBottom: 10, background: "var(--panel)",
  };
  const small: CSSProperties = { fontSize: "var(--text-caption1)", color: "var(--muted)" };

  return (
    <div style={{ marginTop: 26 }}>
      <h3 style={{ margin: 0, color: "var(--text)" }}>📋 Weekly report card</h3>
      <p className="subtitle" style={{ margin: "6px 0 0" }}>
        Every Monday at 10 AM each telecaller gets their own week on WhatsApp: their numbers, two things they did
        well and two to do better, taken from their own recorded calls. Each point names the buyer and the day,
        so they can find the call. Preview shows the exact message they will get.
      </p>

      {list && (
        <div style={{ display: "flex", gap: 10, alignItems: "center", margin: "12px 0", flexWrap: "wrap" }}>
          <span style={{
            fontSize: "var(--text-footnote)", fontWeight: "var(--weight-semibold)",
            color: list.monday_on ? "var(--good)" : "var(--warn)",
            border: `1px solid ${list.monday_on ? "var(--good)" : "var(--warn)"}`, borderRadius: 999, padding: "2px 10px",
          }}>
            Monday sending: {list.monday_on ? "On" : "Off"}
          </span>
          {isSuper && (
            <button className={list.monday_on ? "link" : "primary"} onClick={() => void switchMonday(!list.monday_on)}>
              {list.monday_on ? "Switch off" : "Switch on for all companies"}
            </button>
          )}
          {!isSuper && !list.monday_on && (
            <span style={small}>Call Pro AI switches this on. You can still preview and send one by hand.</span>
          )}
          <span style={small}>This card covers {shortDate(list.week_from)} – {shortDate(list.week_to)}.</span>
          {isSuper && companies.length > 1 && (
            <select value={company} onChange={(e) => setCompany(e.target.value)} style={{ width: "auto", marginLeft: "auto" }}>
              <option value="all">🏢 All companies</option>
              {companies.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          )}
        </div>
      )}

      {err && <div className="error" style={{ marginBottom: 10 }}>{err}</div>}
      {!list && !err && <div className="empty" role="status">Loading telecallers.</div>}
      {list && shown.length === 0 && <div className="empty">No active telecallers here.</div>}

      {shown.map((r) => {
        const feedback = r.recorded_calls >= MIN_FOR_FEEDBACK;
        const p = preview[r.salesperson_id];
        const m = msg[r.salesperson_id];
        return (
          <div key={r.salesperson_id} style={card}>
            <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
              <strong style={{ color: "var(--text)", fontSize: "var(--text-subheadline)" }}>{r.full_name?.trim() || "Telecaller"}</strong>
              {isSuper && <span style={small}>· {r.company_name?.trim() ?? "—"}</span>}
              <span style={{ fontSize: "var(--text-caption1)", color: feedback ? "var(--good)" : "var(--warn)" }}>
                {feedback
                  ? `🎙️ ${r.recorded_calls} recorded calls: gets call feedback`
                  : r.recorded_calls === 0
                    ? "🎙️ No recorded calls: numbers only"
                    : `🎙️ Only ${r.recorded_calls} recorded: numbers only`}
              </span>
              <span style={{ fontSize: "var(--text-caption1)", color: r.has_phone ? "var(--muted)" : "var(--bad)" }}>
                {r.has_phone ? `· WhatsApp …${r.phone_tail}` : "· No WhatsApp number"}
              </span>
              {r.sent_at && <span style={{ fontSize: "var(--text-caption1)", color: "var(--good)" }}>· Sent {ist(r.sent_at)}</span>}
              <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                <button className="link" disabled={busy === r.salesperson_id}
                  onClick={() => open === r.salesperson_id ? setOpen(null) : void showCard(r)}>
                  {busy === r.salesperson_id && !confirm ? "Building…" : open === r.salesperson_id ? "Hide" : "Preview"}
                </button>
                {r.has_phone && (
                  <button className="primary" disabled={busy === r.salesperson_id} onClick={() => setConfirm(r.salesperson_id)}>
                    Send now
                  </button>
                )}
              </span>
            </div>

            {!r.has_phone && (
              <div style={{ ...small, marginTop: 6 }}>
                Add their number on <a href="/dashboard/salespeople" style={{ color: "var(--accent)" }}>Salespeople</a>, or
                as their own report on <a href="/dashboard/pulse" style={{ color: "var(--accent)" }}>Daily Pulse</a>.
              </div>
            )}
            {!feedback && r.has_phone && (
              <div style={{ ...small, marginTop: 6 }}>
                Their calls are not reaching us as recordings, so there is nothing to give feedback on. Switch on call
                recording on their phone; <a href="/dashboard/health" style={{ color: "var(--accent)" }}>Phone Health</a> shows
                whether recordings are arriving.
              </div>
            )}

            {confirm === r.salesperson_id && (
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: "var(--text-footnote)", color: "var(--text)" }}>
                  Send this week&apos;s card to …{r.phone_tail} now?
                </span>
                <button className="primary" onClick={() => void send(r)}>Yes, send</button>
                <button className="link" onClick={() => setConfirm(null)}>Cancel</button>
              </div>
            )}
            {m && (
              <div style={{ marginTop: 8, fontSize: "var(--text-caption1)", color: m.ok ? "var(--warn)" : "var(--bad)" }}>
                {m.ok ? `${m.text} Check their phone.` : m.text}
              </div>
            )}

            {open === r.salesperson_id && p && (
              <div style={{ marginTop: 10 }}>
                {p.note && <div style={{ ...small, marginBottom: 6 }}>{p.note}</div>}
                {p.text && (
                  <pre style={{
                    whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: "var(--text-footnote)", color: "var(--text)",
                    background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 10, padding: 12, margin: 0, lineHeight: 1.5,
                  }}>{p.text}</pre>
                )}
                <button className="link" style={{ marginTop: 6 }} disabled={busy === r.salesperson_id} onClick={() => void showCard(r, true)}>
                  Build it again from the calls
                </button>
              </div>
            )}
            {feedback && <RepPersona salespersonId={r.salesperson_id} name={r.full_name?.trim() || "this telecaller"} />}
          </div>
        );
      })}
    </div>
  );
}
