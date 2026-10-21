"use client";
// Scan list in the browser: camera / photo / pasted text → on-device OCR
// (tesseract.js, loaded only when needed) → the same parser rules as the Android
// Scan list → review → add. The photo never leaves the phone.
import { useEffect, useMemo, useRef, useState } from "react";
import { type Lead, type Profile, addScanned } from "@/lib/tele/data";
import { type ScanRow, defaultScanTag, key, parse } from "@/lib/tele/scanParser";
import { demoScanText } from "@/lib/tele/demo";

type Stage = "pick" | "paste" | "reading" | "review";

export function ScanTab({ profile, demo, leads, startAt, onAdded }: {
  profile: Profile | null; demo: boolean; leads: Lead[]; startAt: string | null; onAdded: (n: number) => void;
}) {
  const [stage, setStage] = useState<Stage>("pick");
  const [text, setText] = useState("");
  const [rows, setRows] = useState<ScanRow[]>([]);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [progress, setProgress] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cam = useRef<HTMLInputElement>(null);
  const gal = useRef<HTMLInputElement>(null);

  const inCrm = useMemo(() => new Set(leads.map((l) => key(l.phone)).filter(Boolean) as string[]), [leads]);
  const addable = (r: ScanRow) => r.valid && !r.duplicate && !inCrm.has(key(r.phone) ?? "");

  function review(t: string) {
    const rs = parse(t);
    setRows(rs);
    setPicked(new Set(rs.map((r, i) => (addable(r) ? i : -1)).filter((i) => i >= 0)));
    setStage("review");
  }

  useEffect(() => { if (startAt === "review") review(demoScanText); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [startAt]);

  async function ocr(file: File) {
    setErr(null); setStage("reading"); setProgress(0);
    try {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("eng", 1, {
        logger: (m: { status: string; progress: number }) => { if (m.status === "recognizing text") setProgress(Math.round(m.progress * 100)); },
      });
      const { data } = await worker.recognize(file);
      await worker.terminate();
      if (!data.text.trim()) throw new Error("Couldn't read any text. Try a sharper, well-lit photo.");
      review(data.text);
    } catch (x: any) {
      setErr(x?.message ?? "Couldn't read that photo."); setStage("pick");
    }
  }

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) ocr(f); };

  if (stage === "reading") {
    return (
      <div className="pad">
        <h1 className="title">Scan list</h1>
        <div className="tcard reading"><div className="spinner" /><b>Reading numbers… {progress}%</b>
          <small className="muted">On your phone — the photo isn&apos;t uploaded.</small>
          <div className="tbar"><span style={{ width: `${progress}%` }} /></div></div>
      </div>
    );
  }

  if (stage === "review") {
    const n = picked.size;
    return (
      <div className="pad">
        <header className="top"><h1 className="title">Review</h1><button className="link" onClick={() => setStage("pick")}>Start over</button></header>
        <p className="muted">{rows.length} number{rows.length === 1 ? "" : "s"} found · tagged &ldquo;{defaultScanTag()}&rdquo;</p>
        <div className="tcard list">
          {rows.length === 0 && <p className="tempty">No phone numbers found.</p>}
          {rows.map((r, i) => {
            const ok = addable(r);
            const why = !r.valid ? "Not a valid mobile" : r.duplicate ? "Repeated in this list" : !ok ? "Already in your leads" : null;
            return (
              <label key={i} className={`row scanrow ${ok ? "" : "off"}`}>
                <input type="checkbox" disabled={!ok} checked={picked.has(i)} onChange={(e) => {
                  const s = new Set(picked); if (e.target.checked) s.add(i); else s.delete(i); setPicked(s);
                }} />
                <span className="row-main"><b>{r.name || "No name"}</b><small>{r.phone}{why ? ` · ${why}` : ""}</small></span>
              </label>
            );
          })}
        </div>
        {err && <p className="err">{err}</p>}
        <button className="tbtn primary big" disabled={!n || busy} onClick={async () => {
          setBusy(true); setErr(null);
          try {
            const chosen = rows.filter((_, i) => picked.has(i));
            if (!demo && profile) await addScanned(profile, chosen, defaultScanTag());
            setStage("pick"); setRows([]); onAdded(chosen.length);
          } catch (x: any) { setErr(x?.message ?? "Couldn't add leads."); } finally { setBusy(false); }
        }}>{busy ? "Adding…" : `Add ${n} lead${n === 1 ? "" : "s"}`}</button>
      </div>
    );
  }

  if (stage === "paste") {
    return (
      <div className="pad">
        <header className="top"><h1 className="title">Paste text</h1><button className="link" onClick={() => setStage("pick")}>Cancel</button></header>
        <div className="tcard form">
          <textarea rows={10} autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste a WhatsApp chat, an Excel column or any list with numbers" />
          <button className="tbtn primary" disabled={!text.trim()} onClick={() => review(text)}>Find numbers</button>
        </div>
      </div>
    );
  }

  return (
    <div className="pad">
      <h1 className="title">Scan list</h1>
      <p className="muted">Turn a register page, a screenshot or a WhatsApp list into leads.</p>
      <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={onFile} />
      <input ref={gal} type="file" accept="image/*" hidden onChange={onFile} />
      <button className="scanbig" onClick={() => cam.current?.click()}>
        <svg viewBox="0 0 24 24" aria-hidden><path d="M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8" /></svg>
        <b>Take a photo</b><small>Point at a printed or handwritten list</small>
      </button>
      <div className="scan2">
        <button className="tcard" onClick={() => gal.current?.click()}><b>Choose photo</b><small>Screenshot or gallery</small></button>
        <button className="tcard" onClick={() => setStage("paste")}><b>Paste text</b><small>WhatsApp, Excel, notes</small></button>
      </div>
      {err && <p className="err">{err}</p>}
      <p className="fine">Reading happens on your phone. You check every number before it&apos;s added; numbers already in your leads are skipped.</p>
    </div>
  );
}
