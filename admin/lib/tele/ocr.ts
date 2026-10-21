"use client";
// On-device OCR for Scan list. Three things make it fast:
//   1. warmOcr() starts loading the reader when the Scan tab opens, so it is
//      ready by the time the camera hands a photo back — not after.
//   2. ONE reader for the whole session. Creating and terminating a worker per
//      photo re-compiled the WASM and re-read the language file every time.
//   3. Photos are shrunk to 2400px on the long side first. Measured on a 12 MP
//      register photo and a dense printed list: 2400px read every number of
//      both, 40% faster on the dense one; 2000px lost 4 of 25 numbers on the
//      dense list, so it is not 2000. If a shrunk photo yields no number at all,
//      the full photo is read again — slow, but never silently empty.
// The photo never leaves the phone.
import type { Worker } from "tesseract.js";
import { parse } from "./scanParser";

let worker: Promise<Worker> | null = null;
let sink: ((p: number) => void) | null = null;

export function warmOcr(): Promise<Worker> {
  if (!worker) {
    worker = import("tesseract.js")
      .then(({ createWorker }) => createWorker("eng", 1, {
        logger: (m: { status: string; progress: number }) => {
          if (m.status === "recognizing text") sink?.(m.progress);
        },
      }))
      .catch((e) => { worker = null; throw e; });
  }
  return worker;
}

async function shrink(file: Blob, max = 2400): Promise<HTMLCanvasElement | Blob> {
  try {
    // createImageBitmap applies the photo's EXIF rotation in current browsers.
    const bmp = await createImageBitmap(file);
    const scale = max / Math.max(bmp.width, bmp.height);
    if (scale >= 1) { bmp.close(); return file; }
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close();
    return c;
  } catch {
    return file;
  }
}

/** Text of one photo. onProgress gets 0..1 while the reader works. */
export async function readPhoto(file: Blob, onProgress: (p: number) => void): Promise<string> {
  const [w, img] = await Promise.all([warmOcr(), shrink(file)]);
  sink = onProgress;
  try {
    const { data } = await w.recognize(img);
    if (img === file || parse(data.text).some((r) => r.valid)) return data.text;
    const { data: full } = await w.recognize(file);
    return full.text;
  } finally {
    sink = null;
  }
}
