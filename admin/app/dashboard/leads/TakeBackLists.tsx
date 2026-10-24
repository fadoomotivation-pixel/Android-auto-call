"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type List = { lead_source: string; leads: number; called: number; booked: number; newest: string };

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });

/**
 * "Remove all the numbers from my app — new leads keep mixing with the old."
 *
 * What a telecaller means by that is a LIST: every scan or import carries its
 * name in lead_source ("Scanned list · 21 Oct"), and two lists sitting in the
 * same New tab look like one mess. So the admin takes back a list, not a pile
 * of ticked rows. The leads go to Unassigned with their history intact — never
 * deleted — and a lead with a callback booked stays with the rep unless the
 * admin says otherwise, because that one is a live conversation.
 */
export function TakeBackLists({
  salespersonId, name, onDone,
}: { salespersonId: string; name: string; onDone: () => Promise<void> | void }) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [lists, setLists] = useState<List[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [keepBooked, setKeepBooked] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    const { data, error } = await supabase.rpc("rep_lead_lists", { p_salesperson: salespersonId });
    if (error) { setErr(error.message); setLists([]); return; }
    setLists((data as List[] | null) ?? []);
  }, [supabase, salespersonId]);

  useEffect(() => { setLists(null); setPicked(new Set()); setMsg(null); if (open) void load(); }, [open, load]);

  const chosen = (lists ?? []).filter((l) => picked.has(l.lead_source));
  const moving = chosen.reduce((n, l) => n + l.leads - (keepBooked ? l.booked : 0), 0);
  const staying = keepBooked ? chosen.reduce((n, l) => n + l.booked, 0) : 0;

  async function takeBack() {
    if (!chosen.length || moving === 0) return;
    if (!confirm(
      `Take ${moving} lead(s) back from ${name} to Unassigned?\n\n` +
      `They leave ${name}'s app now. Nothing is deleted: notes, calls and history stay on each lead, ` +
      `and you can give them to anyone from the Unassigned tab.` +
      (staying ? `\n\n${staying} lead(s) with a callback booked stay with ${name}.` : ""),
    )) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("take_back_leads", {
      p_salesperson: salespersonId,
      p_sources: chosen.map((l) => l.lead_source),
      p_keep_booked: keepBooked,
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    const r = data as { taken: number; kept_booked: number };
    setMsg(`${r.taken} lead(s) moved to Unassigned.${r.kept_booked ? ` ${r.kept_booked} with a callback stayed with ${name}.` : ""}`);
    setPicked(new Set());
    await load();
    await onDone();
  }

  if (!open) {
    return (
      <div className="toolbar">
        <button className="link" onClick={() => setOpen(true)}>
          Take back a lead list from {name}…
        </button>
      </div>
    );
  }

  return (
    <div className="card" style={{ marginBottom: 0 }}>
      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <strong style={{ color: "var(--text)", fontSize: "var(--text-subheadline)" }}>Take back a lead list from {name}</strong>
        <button className="link" onClick={() => setOpen(false)}>Close</button>
      </div>
      <p className="subtitle" style={{ margin: "4px 0 10px" }}>
        Each scan or import is one list. Pick the lists to take back. They move to Unassigned and leave {name}&apos;s
        app. Nothing is deleted.
      </p>

      {err && <div className="error" style={{ marginBottom: 8 }}>{err}</div>}
      {!lists && !err && <div className="empty" role="status">Loading {name}&apos;s lists.</div>}
      {lists && lists.length === 0 && <div className="empty">{name} has no leads right now.</div>}

      {(lists ?? []).map((l) => (
        <label key={l.lead_source} style={{
          display: "flex", gap: 10, alignItems: "baseline", padding: "8px 0", borderTop: "1px solid var(--border)", cursor: "pointer",
        }}>
          <input
            type="checkbox"
            checked={picked.has(l.lead_source)}
            onChange={() => setPicked((p) => {
              const n = new Set(p);
              if (n.has(l.lead_source)) n.delete(l.lead_source); else n.add(l.lead_source);
              return n;
            })}
          />
          <span style={{ color: "var(--text)", fontSize: "var(--text-body)" }}>{l.lead_source}</span>
          <span style={{ color: "var(--muted)", fontSize: "var(--text-caption1)" }}>
            {l.leads} lead{l.leads === 1 ? "" : "s"} · {l.called} called · {l.booked} with a callback · newest {day(l.newest)}
          </span>
        </label>
      ))}

      {lists && lists.length > 0 && (
        <>
          <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, fontSize: "var(--text-footnote)", color: "var(--text)" }}>
            <input type="checkbox" checked={keepBooked} onChange={(e) => setKeepBooked(e.target.checked)} />
            Keep leads that have a callback booked with {name}
          </label>
          <div className="toolbar" style={{ marginTop: 10 }}>
            <button className="primary" disabled={busy || moving === 0} onClick={() => void takeBack()}>
              {busy ? "Moving…" : `Take back ${moving} lead${moving === 1 ? "" : "s"}`}
            </button>
            {staying > 0 && (
              <span style={{ color: "var(--muted)", fontSize: "var(--text-caption1)" }}>
                {staying} with a callback stay with {name}.
              </span>
            )}
          </div>
        </>
      )}
      {msg && <div style={{ marginTop: 8, fontSize: "var(--text-caption1)", color: "var(--good)" }}>{msg}</div>}
    </div>
  );
}
