"use client";
// Scan list in the browser: camera / photos / pasted text → on-device OCR
// (lib/tele/ocr.ts) → the same parser rules as the Android Scan list → review →
// add. The photo never leaves the phone.
//
// Duplicates are settled BEFORE the review screen, company-wide: a number the
// rep already has, a teammate has, or a customer asked us not to call is shown
// with that reason and cannot be ticked (scan_known_phones, migration 0229).
// So "Add 8 leads" adds 8.
import { useEffect, useMemo, useRef, useState } from "react";
import { type Known, type Lead, type Profile, addScanned, knownPhones } from "@/lib/tele/data";
import { type ScanRow, defaultScanTag, key, parse } from "@/lib/tele/scanParser";
import { readPhoto, warmOcr } from "@/lib/tele/ocr";
import { demoScanText } from "@/lib/tele/demo";

type Stage = "pick" | "paste" | "reading" | "review";
type Why = "new" | "bad" | "repeat" | Known;

const WHY: Record<Exclude<Why, "new">, string> = {
  bad: "Not a mobile number",
  repeat: "Twice in this list",
  mine: "Already your lead",
  team: "A teammate has it",
  dnc: "Asked not to be called",
};

const spaced = (p: string) => (p.length === 10 ? `${p.slice(0, 5)} ${p.slice(5)}` : p);

export function ScanTab({ profile, demo, leads, startAt, onAdded }: {
  profile: Profile | null; demo: boolean; leads: Lead[]; startAt: string | null; onAdded: (n: number, taken: number) => void;
}) {
  const [stage, setStage] = useState<Stage>("pick");
  const [texts, setTexts] = useState<string[]>([]);
  const [paste, setPaste] = useState("");
  const [names, setNames] = useState<Record<number, string>>({});
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [known, setKnown] = useState<Map<string, Known> | null>(new Map());
  const [checking, setChecking] = useState(false);
  const [reading, setReading] = useState({ i: 0, n: 0, p: 0, thumb: null as string | null });
  const [readerReady, setReaderReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cam = useRef<HTMLInputElement>(null);
  const gal = useRef<HTMLInputElement>(null);

  // Start loading the reader now; the camera takes longer than this does.
  useEffect(() => { warmOcr().then(() => setReaderReady(true)).catch(() => {}); }, []);
  useEffect(() => { if (startAt === "review") { setTexts([demoScanText]); setStage("review"); } }, [startAt]);

  const rows = useMemo(() => parse(texts.join("\n")), [texts]);
  const mineLocal = useMemo(() => new Set(leads.map((l) => key(l.phone)).filter(Boolean) as string[]), [leads]);
  // Read through a ref in the check below: the lead list refreshes every few
  // minutes, and that must not re-tick rows the rep has just unticked.
  const mineRef = useRef(mineLocal);
  mineRef.current = mineLocal;

  const why = (r: ScanRow): Why => {
    if (!r.valid) return "bad";
    if (r.duplicate) return "repeat";
    const k = key(r.phone) ?? "";
    return known?.get(k) ?? (mineLocal.has(k) ? "mine" : "new");
  };

  // Ask the server who already has these numbers, every time the list grows.
  useEffect(() => {
    if (stage !== "review") return;
    const tails = [...new Set(rows.filter((r) => r.valid).map((r) => key(r.phone)).filter(Boolean) as string[])];
    let live = true;
    const settle = (m: Map<string, Known> | null) => {
      if (!live) return;
      setKnown(m); setChecking(false);
      const isNew = (r: ScanRow) => r.valid && !r.duplicate && !m?.get(key(r.phone) ?? "") && !mineRef.current.has(key(r.phone) ?? "");
      setPicked(new Set(rows.map((r, i) => (isNew(r) ? i : -1)).filter((i) => i >= 0)));
    };
    if (demo || !tails.length) { settle(new Map()); return; }
    setChecking(true);
    knownPhones(tails).then(settle);
    return () => { live = false; };
  }, [rows, stage, demo]);

  async function readFiles(files: File[]) {
    if (!files.length) return;
    setErr(null); setStage("reading");
    const got: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const thumb = URL.createObjectURL(files[i]);
      setReading({ i: i + 1, n: files.length, p: 0, thumb });
      try {
        const t = await readPhoto(files[i], (p) => setReading((r) => ({ ...r, p })));
        if (t.trim()) got.push(t);
      } catch { /* one bad photo must not lose the others */ }
      URL.revokeObjectURL(thumb);
    }
    setReaderReady(true);
    if (!got.length) {
      setErr("Couldn't read that. Try a sharper photo in good light.");
      setStage(texts.length ? "review" : "pick");
      return;
    }
    setTexts((t) => [...t, ...got]);
    setStage("review");
  }

  const onFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fs = Array.from(e.target.files ?? []);
    e.target.value = "";
    readFiles(fs);
  };

  const reset = () => { setTexts([]); setNames({}); setPicked(new Set()); setErr(null); setStage("pick"); };

  const inputs = (
    <>
      <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={onFiles} />
      <input ref={gal} type="file" accept="image/*" multiple hidden onChange={onFiles} />
    </>
  );

  if (stage === "reading") {
    return (
      <div className="pad">
        <h1 className="title">Scan list</h1>
        <div className="tcard reading">
          {reading.thumb && <img className="thumb" src={reading.thumb} alt="" />}
          <b>{reading.n > 1 ? `Reading photo ${reading.i} of ${reading.n}` : "Reading numbers"}… {Math.round(reading.p * 100)}%</b>
          <div className="tbar"><span style={{ width: `${Math.round(reading.p * 100)}%` }} /></div>
          <small className="muted">{readerReady ? "On your phone — the photo isn't uploaded." : "Getting the reader ready. Only the first time."}</small>
        </div>
      </div>
    );
  }

  if (stage === "review") {
    const whys = rows.map(why);
    const count = (w: Why) => whys.filter((x) => x === w).length;
    const n = picked.size;
    return (
      <div className="pad pad-sticky">
        {inputs}
        <header className="top"><h1 className="title">Review</h1><button className="link" onClick={reset}>Start over</button></header>
        <p className="muted explain">Ticked numbers become your new leads. Tap a name to fix it.</p>
        <div className="sum">
          <span className="sum-new">{count("new")} new</span>
          {count("mine") > 0 && <span>{count("mine")} already yours</span>}
          {count("team") > 0 && <span>{count("team")} with a teammate</span>}
          {count("dnc") > 0 && <span>{count("dnc")} do not call</span>}
          {count("repeat") + count("bad") > 0 && <span>{count("repeat") + count("bad")} skipped</span>}
        </div>
        {known === null && <p className="note">Couldn&apos;t check your team&apos;s leads. Any number a teammate has is skipped when you add.</p>}
        <div className="tcard list">
          {rows.length === 0 && <p className="tempty">No phone numbers found. Try another photo, or paste the text.</p>}
          {rows.map((r, i) => {
            const w = whys[i];
            const ok = w === "new";
            return (
              <div key={i} className={`row scanrow ${ok ? "" : "off"}`}>
                <input type="checkbox" aria-label={`Add ${r.phone}`} disabled={!ok} checked={picked.has(i)} onChange={(e) => {
                  const s = new Set(picked); if (e.target.checked) s.add(i); else s.delete(i); setPicked(s);
                }} />
                <span className="row-main">
                  <input className="nameedit" value={names[i] ?? r.name ?? ""} placeholder="Add name" disabled={!ok}
                    onChange={(e) => setNames({ ...names, [i]: e.target.value })} />
                  <small>{spaced(r.phone)}{ok ? "" : ` · ${WHY[w as Exclude<Why, "new">]}`}</small>
                </span>
              </div>
            );
          })}
        </div>
        <div className="scan-more">
          <button className="tbtn" onClick={() => cam.current?.click()}>+ Another photo</button>
          <button className="tbtn" onClick={() => gal.current?.click()}>+ From gallery</button>
        </div>
        {err && <p className="err">{err}</p>}
        <div className="stickybar">
          <button className="tbtn primary big" disabled={!n || busy || checking} onClick={async () => {
            setBusy(true); setErr(null);
            try {
              const chosen = rows.map((r, i) => ({ ...r, name: (names[i] ?? r.name ?? "").trim() || null }))
                .filter((_, i) => picked.has(i));
              const added = !demo && profile ? await addScanned(profile, chosen, defaultScanTag()) : chosen.length;
              reset(); onAdded(added, chosen.length - added);
            } catch (x: any) { setErr(x?.message ?? "Couldn't add leads."); } finally { setBusy(false); }
          }}>{checking ? "Checking your team's leads…" : busy ? "Adding…" : n ? `Add ${n} lead${n === 1 ? "" : "s"}` : "Nothing new to add"}</button>
        </div>
      </div>
    );
  }

  if (stage === "paste") {
    return (
      <div className="pad">
        <header className="top"><h1 className="title">Paste text</h1><button className="link" onClick={() => setStage(texts.length ? "review" : "pick")}>Cancel</button></header>
        <div className="tcard form">
          <textarea rows={10} autoFocus value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Paste a WhatsApp chat, an Excel column or any list with numbers" />
          <button className="tbtn primary" disabled={!paste.trim()} onClick={() => { setTexts((t) => [...t, paste]); setPaste(""); setStage("review"); }}>Find numbers</button>
        </div>
      </div>
    );
  }

  return (
    <div className="pad">
      {inputs}
      <h1 className="title">Scan list</h1>
      <p className="muted explain">Turn a register page, a screenshot or a WhatsApp list into leads.</p>
      <button className="scanbig" onClick={() => cam.current?.click()}>
        <svg viewBox="0 0 24 24" aria-hidden><path d="M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8" /></svg>
        <b>Take a photo</b><small>Point at a printed or handwritten list</small>
      </button>
      <div className="scan2">
        <button className="tcard" onClick={() => gal.current?.click()}><b>Choose photos</b><small>One or many screenshots</small></button>
        <button className="tcard" onClick={() => setStage("paste")}><b>Paste text</b><small>WhatsApp, Excel, notes</small></button>
      </div>
      {err && <p className="err">{err}</p>}
      <p className="fine">
        {readerReady ? "Photo reader ready. " : "Getting the photo reader ready… "}
        Reading happens on your phone. Numbers you, a teammate or a do-not-call list already have are never added twice.
      </p>
    </div>
  );
}
