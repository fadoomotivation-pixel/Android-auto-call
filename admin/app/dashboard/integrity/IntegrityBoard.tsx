"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { createClient } from "@/lib/supabase/client";

interface Row {
  company_id: string;
  company_name: string | null;
  salesperson_id: string;
  rep_name: string | null;
  flag: string;
  n: number;
  sample: string | null;
  last_at: string | null;
}

/**
 * Every flag is a QUESTION, not a verdict — so each one ships with the innocent
 * explanation next to it and an action that starts with listening, not accusing.
 * A manager who treats these as proof will burn a good rep; the copy is written
 * to stop that.
 */
const FLAGS: Record<string, { title: string; why: string; innocent: string; action: string; tone: string }> = {
  talked_no_outcome: {
    title: "Talked, but nothing written",
    why: "The call was longer than a minute, and the lead has no outcome, note, or voice note. To everyone else, the lead looks untouched.",
    innocent: "They skipped the prompt in a hurry. This is the most common reason.",
    action: "Listen to that call's recording. Then ask the rep what was said.",
    tone: "#f59e0b",
  },
  long_call_then_dead: {
    title: "Long talk, then 'not interested'",
    why: "The call was 2+ minutes, and the same day the lead was marked not interested, lost, or DNC.",
    innocent: "The customer really said no. That is often what happened.",
    action: "Listen to the recording. If the customer sounded interested, open the lead again.",
    tone: "#ef4444",
  },
  callback_never_dialled: {
    title: "Promised a callback, then never called",
    why: "The rep set a callback time. That time passed more than 12 hours ago. The call log shows no call to that lead after it. The call log proves this. It is not a guess that they forgot.",
    innocent: "The lead may have called first, or the rep may have used a personal number. Personal calls do not enter the CRM.",
    action: "Ask the rep what happened to these leads, and put them at the top of the list today. The customer is waiting.",
    tone: "#ef4444",
  },
  visit_unverified: {
    title: "Site visit written, GPS did not confirm it",
    why: "The visit is in the CRM, but the rep's location did not match the project.",
    innocent: "The project's location pin is not set, or there was no network at the site.",
    action: "First check the project's location pin in Buyer Projects. Then ask the rep.",
    tone: "#ef4444",
  },
  missing_recording: {
    title: "Long calls with no recording",
    why: "This rep's other calls are being recorded. These long calls are not.",
    innocent: "The recorder missed the file partway through. This happens.",
    action: "Open the Phone Health page. If everything looks fine there, these calls are worth asking about.",
    tone: "#f59e0b",
  },
  offcrm_repeat: {
    title: "Repeated long calls to one number outside the CRM",
    why: "3+ calls to the same non-CRM number, and 5+ minutes in total. It looks like they treated that number as a lead.",
    innocent: "It may be a home number, a manager, or a vendor.",
    action: "Look at the number. If it is a customer, add the lead to the CRM.",
    tone: "#ef4444",
  },
  booked_without_calls: {
    title: "Booked, but no call in the CRM",
    why: "The lead reached booked or token, but there is no call history.",
    innocent: "The deal may have been a walk-in, or a referral from someone else.",
    action: "Ask where the conversation happened. If it was on a personal number, it stayed outside the CRM.",
    tone: "#ef4444",
  },
};

const ist = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "—";

export function IntegrityBoard({ isSuper }: { isSuper: boolean }) {
  const supabase = createClient();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [days, setDays] = useState(30);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    const { data, error } = await supabase.rpc("rep_integrity", { p_days: days });
    if (error) { setErr(error.message); return; }
    setRows((data as Row[]) ?? []);
  }, [supabase, days]);

  useEffect(() => { void load(); }, [load]);

  // One card per rep, their flags inside, worst first.
  const byRep = useMemo(() => {
    const map = new Map<string, { name: string; company: string; flags: Row[] }>();
    for (const r of rows ?? []) {
      const key = r.salesperson_id;
      if (!map.has(key)) {
        map.set(key, { name: r.rep_name ?? "Telecaller", company: r.company_name ?? "Company", flags: [] });
      }
      map.get(key)!.flags.push(r);
    }
    const red = (f: Row) => (FLAGS[f.flag]?.tone === "#ef4444" ? 1 : 0);
    return [...map.values()]
      .map((v) => ({ ...v, flags: v.flags.sort((a, b) => red(b) - red(a) || b.n - a.n) }))
      .sort((a, b) =>
        b.flags.filter((f) => FLAGS[f.flag]?.tone === "#ef4444").length -
          a.flags.filter((f) => FLAGS[f.flag]?.tone === "#ef4444").length ||
        b.flags.length - a.flags.length);
  }, [rows]);

  const card: CSSProperties = {
    background: "var(--panel-grad, var(--panel))", border: "1px solid var(--border)",
    borderRadius: 18, padding: 20, marginBottom: 14,
  };

  return (
    <>
      <div style={{ display: "flex", gap: 10, alignItems: "center", margin: "12px 0", flexWrap: "wrap" }}>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ width: "auto" }}>
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
        <button className="link" onClick={() => void load()}>Refresh</button>
      </div>

      {err && <div className="error" style={{ marginBottom: 10 }}>{err}</div>}
      {!rows && <div className="empty">Checking…</div>}
      {rows && byRep.length === 0 && (
        <div className="empty">Nothing in this window is worth a question. 👍</div>
      )}

      {byRep.map((rep) => (
        <div key={rep.name + rep.company} style={card}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <strong style={{ color: "#fff", fontSize: 16 }}>{rep.name}</strong>
            {isSuper && <span style={{ fontSize: 12.5, color: "var(--muted)" }}>· {rep.company}</span>}
            <span style={{ marginLeft: "auto", fontSize: 12.5, color: "var(--muted)" }}>
              {rep.flags.length} things worth a look
            </span>
          </div>

          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
            {rep.flags.map((f) => {
              const meta = FLAGS[f.flag];
              if (!meta) return null;
              return (
                <div key={f.flag} style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 10 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, color: meta.tone,
                      border: `1px solid ${meta.tone}`, borderRadius: 999, padding: "2px 8px",
                    }}>{f.n}</span>
                    <strong style={{ color: "#fff", fontSize: 14 }}>{meta.title}</strong>
                    <span style={{ fontSize: 12, color: "var(--muted)", marginLeft: "auto" }}>
                      last: {ist(f.last_at)}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4, lineHeight: 1.55 }}>
                    {meta.why}
                    {f.sample && <> <span style={{ color: "var(--text)" }}>For example: <strong>{f.sample}</strong>.</span></>}
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 4, lineHeight: 1.55 }}>
                    🤔 Could be: {meta.innocent}
                  </div>
                  <div style={{ fontSize: 12.5, marginTop: 4, lineHeight: 1.55, color: "#22c55e" }}>
                    ✅ {meta.action}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div style={{ ...card, borderColor: "rgba(255,255,255,0.08)" }}>
        <strong style={{ color: "#fff", fontSize: 14.5 }}>How to read this</strong>
        <p className="subtitle" style={{ margin: "6px 0 0", lineHeight: 1.65 }}>
          Every item here is a <strong>question</strong>, not <strong>proof</strong>. Each flag can have a simple
          reason. The recorder missed a file. The customer really said no. There was no network at the site.
          That is why each flag includes an innocent reason. The first step is always to
          <strong> listen to the recording or talk to the rep</strong>. Do not accuse. Losing a good rep to suspicion
          costs more than cheating does.
        </p>
        <p className="subtitle" style={{ margin: "10px 0 0", lineHeight: 1.65 }}>
          <strong>What this cannot see:</strong> a rep&apos;s <strong>personal WhatsApp</strong> chats. The app only opens WhatsApp.
          It does not read it. A customer&apos;s chat shows up only when it goes through the <strong>company&apos;s WhatsApp number
          (Cloud API)</strong>. That has to be connected on the WhatsApp page, and no company has done that yet.
          If you want chats to start showing, that is the first step.
        </p>
      </div>
    </>
  );
}
