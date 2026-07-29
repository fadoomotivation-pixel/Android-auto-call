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
    title: "Baat hui, par kuch likha nahi",
    why: "Ek minute se lambi baat hui aur lead pe koi outcome, note ya voice note nahi. Baaki sabko lead 'chhui hi nahi' dikhti hai.",
    innocent: "Jaldbaazi me prompt skip kar diya — sabse aam wajah.",
    action: "Us call ki recording sun lein, phir rep se poochhein ki kya baat hui thi.",
    tone: "#f59e0b",
  },
  long_call_then_dead: {
    title: "Lambi baat, phir 'not interested'",
    why: "2+ minute baat hui aur usi din lead ko not interested / lost / DNC kar diya gaya.",
    innocent: "Customer ne sach me mana kar diya — aksar yahi hota hai.",
    action: "Recording sunein. Agar customer interested lag raha tha, to lead wapas khol dein.",
    tone: "#ef4444",
  },
  visit_unverified: {
    title: "Site visit likhi, GPS ne confirm nahi ki",
    why: "Visit CRM me darj hai par rep ki location project se match nahi hui.",
    innocent: "Project ki location pin set nahi hai, ya site pe network nahi tha.",
    action: "Pehle Buyer Projects me us project ka location pin check karein, phir rep se poochhein.",
    tone: "#ef4444",
  },
  missing_recording: {
    title: "Lambi calls jinki recording nahi mili",
    why: "Isi rep ki baaki calls record ho rahi hain, par ye lambi calls nahi.",
    innocent: "Recorder ne beech me file miss kar di — ye aam baat hai.",
    action: "Phone Health page dekhein. Agar wahan sab theek hai to ye calls poochhne layak hain.",
    tone: "#f59e0b",
  },
  offcrm_repeat: {
    title: "CRM se bahar ke ek number pe baar-baar lambi calls",
    why: "Ek hi non-CRM number pe 3+ calls aur kul 5+ minute — jaise usse lead ki tarah kaam kiya ja raha ho.",
    innocent: "Ghar ka, manager ka, ya vendor ka number ho sakta hai.",
    action: "Number dekhein. Agar wo customer nikla to lead CRM me daalwayein.",
    tone: "#ef4444",
  },
  booked_without_calls: {
    title: "Booking, par CRM me ek bhi call nahi",
    why: "Lead booked/token tak pahunchi lekin uski koi call history hi nahi hai.",
    innocent: "Deal walk-in ya kisi aur ke reference se hui ho sakti hai.",
    action: "Poochhein ki baat kahan hui — agar personal number se hui to wo CRM ke bahar chala gaya.",
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
        <div className="empty">Is window me kuch bhi poochhne layak nahi mila. 👍</div>
      )}

      {byRep.map((rep) => (
        <div key={rep.name + rep.company} style={card}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <strong style={{ color: "#fff", fontSize: 16 }}>{rep.name}</strong>
            {isSuper && <span style={{ fontSize: 12.5, color: "var(--muted)" }}>· {rep.company}</span>}
            <span style={{ marginLeft: "auto", fontSize: 12.5, color: "var(--muted)" }}>
              {rep.flags.length} cheez dekhne layak
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
                      aakhri: {ist(f.last_at)}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4, lineHeight: 1.55 }}>
                    {meta.why}
                    {f.sample && <> <span style={{ color: "var(--text)" }}>Jaise: <strong>{f.sample}</strong>.</span></>}
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 4, lineHeight: 1.55 }}>
                    🤔 Ho sakta hai: {meta.innocent}
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
        <strong style={{ color: "#fff", fontSize: 14.5 }}>Ise kaise padhein</strong>
        <p className="subtitle" style={{ margin: "6px 0 0", lineHeight: 1.65 }}>
          Yahan har cheez ek <strong>sawaal</strong> hai, <strong>saboot nahi</strong>. Har flag ki ek seedhi-saadi
          wajah bhi ho sakti hai — recorder ne file miss kar di, customer ne sach me mana kar diya, site pe network
          nahi tha. Isliye har flag ke saath uski nirdosh wajah bhi likhi hai, aur pehla kadam hamesha
          <strong> recording sunna ya rep se baat karna</strong> hai — ilzaam lagana nahi. Ek achhe rep pe shak karke
          use khona, cheating se zyada mehnga padta hai.
        </p>
        <p className="subtitle" style={{ margin: "10px 0 0", lineHeight: 1.65 }}>
          <strong>Jo ye nahi dekh sakta:</strong> rep ki <strong>personal WhatsApp</strong> chats. App sirf WhatsApp
          kholta hai, padhta nahi. Customer ki chat tabhi dikhegi jab wo <strong>company ke WhatsApp number
          (Cloud API)</strong> se ho — wo WhatsApp page pe connect karna padta hai, aur abhi kisi company ka nahi hua
          hai. Chat dikhni shuru karni hai to sabse pehla kadam wahi hai.
        </p>
      </div>
    </>
  );
}
