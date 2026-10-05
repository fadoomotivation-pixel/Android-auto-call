// Streams a call recording to Google Drive: the company's own Drive if it
// connected one, otherwise the platform (super-admin) Drive into a per-company
// subfolder. Marks the call_logs row ready.
// Headers: x-call-id, x-source ('sip'|'sim'), x-duration
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { hasGroq, summarizeAndStore } from "../_shared/summarize.ts";

// EdgeRuntime.waitUntil keeps a background task alive after the response is
// returned (declared here so TypeScript is happy outside the Supabase runtime).
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-call-id, x-source, x-duration",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(o: unknown, s = 200) {
  return new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
}
// Mark a recording failed AND record why, so the cause is visible in the DB /
// admin instead of being swallowed into a response body nobody reads.
async function markFailed(admin: SupabaseClient, callId: string, reason: string) {
  console.error(`recording-upload[${callId}] failed: ${reason}`);
  await admin.from("call_logs")
    .update({ recording_status: "failed", recording_error: reason.slice(0, 500) })
    .eq("id", callId);
}
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Identify the audio container from its magic bytes → [extension, mime]. Falls
// back to the source hint (sim = m4a, cloud = wav) when nothing matches.
function sniffAudio(b: Uint8Array, source: string): [string, string] {
  const ascii = (i: number, s: string) => s.split("").every((ch, k) => b[i + k] === ch.charCodeAt(0));
  if (b.length >= 6 && ascii(0, "#!AMR")) return ["amr", "audio/amr"];       // #!AMR
  if (b.length >= 12 && ascii(0, "RIFF") && ascii(8, "WAVE")) return ["wav", "audio/wav"];
  if (b.length >= 8 && ascii(4, "ftyp")) return ["m4a", "audio/mp4"];        // mp4/m4a/3gp
  if (b.length >= 4 && ascii(0, "OggS")) return ["ogg", "audio/ogg"];
  if (b.length >= 3 && ascii(0, "ID3")) return ["mp3", "audio/mpeg"];
  if (b.length >= 2 && b[0] === 0xff && (b[1] & 0xe0) === 0xe0) return ["mp3", "audio/mpeg"]; // MPEG frame sync
  // sim_speaker / sim_mic / sim_app are phone captures too, not SIP wav.
  return source.startsWith("sim") ? ["m4a", "audio/mp4"] : ["wav", "audio/wav"];
}
/**
 * HOW LONG THE AUDIO ACTUALLY IS — measured from the bytes, not believed.
 *
 * A 4m52s call showed "0:01 / 0:01" in the player and the founder reasonably
 * asked why the recording was one second. Nothing in this platform could
 * answer him, because nothing had ever looked:
 *
 *   duration_seconds   the phone's CALL log — how long the two people talked
 *   recording_seconds  the x-duration header, which is a COPY of that same
 *                      number. It has never described the audio at all.
 *
 * So a stub file and a perfect one are indistinguishable in the database, and
 * both read "4m 52s" in the admin table. The table was not lying on purpose;
 * it had nothing else to print.
 *
 * This reads the real length out of the container. It is cheap — a few header
 * boxes, no decoding — and it is the only number here that is evidence.
 *
 * THE MISSING moov IS THE WHOLE DIAGNOSIS. An MPEG-4 file keeps its duration
 * in a `moov` box that MediaRecorder writes LAST, on stop(). A file that was
 * cut off before that — a killed service, a stop() that threw, an upload that
 * read the file while the recorder still had it open — has audio in it and no
 * moov. Players cannot find a duration, so they print a second; Whisper cannot
 * decode it, so the transcript comes back empty. Both symptoms, one cause, and
 * it is detectable in twenty bytes.
 */
type AudioFacts = { seconds: number | null; complete: boolean; note: string | null };

function readU32(b: Uint8Array, i: number): number {
  return ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];
}

function measureAudio(b: Uint8Array, ext: string): AudioFacts {
  const ascii = (i: number, s: string) => s.split("").every((ch, k) => b[i + k] === ch.charCodeAt(0));

  if (ext === "m4a") {
    // Walk the top-level boxes looking for moov → mvhd.
    let i = 0;
    let sawMdat = false;
    while (i + 8 <= b.length) {
      const size = readU32(b, i);
      const type = String.fromCharCode(b[i + 4], b[i + 5], b[i + 6], b[i + 7]);
      if (type === "mdat") sawMdat = true;
      if (type === "moov") {
        // mvhd is the first child in every file MediaRecorder writes, but scan
        // rather than assume — a scan costs nothing and assumptions cost days.
        const end = size === 0 ? b.length : Math.min(i + size, b.length);
        for (let j = i + 8; j + 20 <= end; j++) {
          if (!ascii(j, "mvhd")) continue;
          const version = b[j + 4];
          const ts = version === 1 ? readU32(b, j + 24) : readU32(b, j + 16);
          const dur = version === 1 ? readU32(b, j + 32) : readU32(b, j + 20);
          if (ts > 0 && dur > 0) return { seconds: Math.round(dur / ts), complete: true, note: null };
          return { seconds: 0, complete: true, note: "mp4 header says zero length" };
        }
        return { seconds: null, complete: true, note: "moov present but unreadable" };
      }
      // Box sizes have three legal shapes and only one of them is a plain
      // number. 0 means "runs to end of file"; 1 means a 64-bit largesize
      // follows the type. Treating either as malformed aborts the walk before
      // moov is reached and reports a perfectly good file as unfinished.
      if (size === 0) break;
      const step = size === 1 ? readU32(b, i + 12) : size;   // low 32 bits is plenty
      if (step < 8) break;      // genuinely malformed; stop rather than loop forever
      i += step;
    }
    return {
      seconds: null,
      complete: false,
      note: sawMdat
        ? "UNFINISHED mp4 — audio present but no moov box, so nothing can play or transcribe it"
        : "not a readable mp4",
    };
  }

  if (ext === "wav" && b.length >= 44) {
    // byteRate lives at offset 28 of the canonical fmt chunk, little-endian.
    const byteRate = b[28] + (b[29] << 8) + (b[30] << 16) + (b[31] << 24);
    if (byteRate > 0) return { seconds: Math.round((b.length - 44) / byteRate), complete: true, note: null };
  }

  if (ext === "amr") {
    // AMR-NB at 12.2 kbit/s: 32-byte frames, 20 ms each. The recorders here use
    // one mode throughout a file, so frame count × 20 ms is close enough to tell
    // one second from five minutes, which is the only question being asked.
    const frames = Math.max(0, Math.floor((b.length - 6) / 32));
    if (frames > 0) return { seconds: Math.round(frames * 0.02), complete: true, note: null };
  }

  if (ext === "mp3") return measureMp3(b);

  // Anything else: no cheap exact answer, and a wrong number would be worse
  // than none.
  return { seconds: null, complete: true, note: null };
}

/**
 * MP3 LENGTH — and a note on why this exists.
 *
 * The first version of measureAudio returned null here, with the comment "no
 * cheap exact answer... left null on purpose". That decision quietly made the
 * whole column useless: 69 recordings arrived measured, every one of them
 * audio_complete true and audio_seconds NULL, because the files these phones
 * actually produce are MP3 — either from the OEM recorder or from the AMR→MP3
 * conversion. An agent re-measuring production found the column empty and
 * reasonably guessed the code had never deployed. It had. It was just
 * declining to answer the one question it was built for.
 *
 * There IS a cheap exact answer, two of them in fact:
 *   · a Xing/Info header carries the frame count, which gives exact duration
 *   · failing that, CBR duration is (bytes × 8) ÷ bitrate, read off frame one
 */
const MP3_BITRATE_V1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const MP3_BITRATE_V2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
const MP3_RATE_V1 = [44100, 48000, 32000];
const MP3_RATE_V2 = [22050, 24000, 16000];
const MP3_RATE_V25 = [11025, 12000, 8000];

function measureMp3(b: Uint8Array): AudioFacts {
  // ID3v2 sits in front of the audio and its size is syncsafe (7 bits a byte).
  let start = 0;
  if (b.length > 10 && b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) {
    start = 10 + (((b[6] & 0x7f) << 21) | ((b[7] & 0x7f) << 14) | ((b[8] & 0x7f) << 7) | (b[9] & 0x7f));
  }

  // First frame sync. Scanning a little way in costs nothing and survives a
  // byte or two of junk between the tag and the audio.
  let f = -1;
  for (let i = start; i < Math.min(b.length - 4, start + 8192); i++) {
    if (b[i] === 0xff && (b[i + 1] & 0xe0) === 0xe0) { f = i; break; }
  }
  if (f < 0) return { seconds: null, complete: true, note: "mp3 with no frame sync" };

  const verBits = (b[f + 1] >> 3) & 0x03;          // 3 = MPEG1, 2 = MPEG2, 0 = MPEG2.5
  const rateIdx = (b[f + 2] >> 2) & 0x03;
  const brIdx = (b[f + 2] >> 4) & 0x0f;
  if (rateIdx === 3 || brIdx === 0 || brIdx === 15) {
    return { seconds: null, complete: true, note: "mp3 header not readable" };
  }

  const isV1 = verBits === 3;
  const rate = (verBits === 3 ? MP3_RATE_V1 : verBits === 2 ? MP3_RATE_V2 : MP3_RATE_V25)[rateIdx];
  const kbps = (isV1 ? MP3_BITRATE_V1 : MP3_BITRATE_V2)[brIdx];
  const samplesPerFrame = isV1 ? 1152 : 576;
  if (!rate || !kbps) return { seconds: null, complete: true, note: "mp3 header not readable" };

  // Xing/Info, when the encoder wrote one, is the exact answer. Its offset
  // from the frame header depends on version and channel mode.
  const mono = ((b[f + 3] >> 6) & 0x03) === 3;
  const xing = f + 4 + (isV1 ? (mono ? 17 : 32) : (mono ? 9 : 17));
  const tag = (i: number, t: string) => t.split("").every((ch, k) => b[i + k] === ch.charCodeAt(0));
  if (xing + 12 < b.length && (tag(xing, "Xing") || tag(xing, "Info"))) {
    const flags = readU32(b, xing + 4);
    if (flags & 1) {
      const frames = readU32(b, xing + 8);
      if (frames > 0) {
        return { seconds: Math.round((frames * samplesPerFrame) / rate), complete: true, note: null };
      }
    }
  }

  // Constant bitrate: bytes × 8 ÷ bits-per-second.
  const audioBytes = b.length - f;
  if (audioBytes <= 0) return { seconds: null, complete: true, note: "mp3 with no audio after the header" };
  return { seconds: Math.round((audioBytes * 8) / (kbps * 1000)), complete: true, note: null };
}

const G_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") ?? "";
const G_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "";

async function driveAccessToken(refreshToken: string): Promise<string> {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: G_CLIENT_ID, client_secret: G_CLIENT_SECRET, refresh_token: refreshToken, grant_type: "refresh_token" }),
  });
  const d = await r.json();
  if (!d.access_token) throw new Error(`Google token: ${JSON.stringify(d)}`);
  return d.access_token as string;
}

async function createFolder(token: string, name: string, parent: string | null): Promise<string | null> {
  const f = await fetch("https://www.googleapis.com/drive/v3/files?fields=id", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: parent ? [parent] : undefined }),
  });
  return (await f.json()).id ?? null;
}

// Resolve which Drive to upload into for a company (own → else platform).
async function resolveDrive(admin: SupabaseClient, companyId: string, companyName: string) {
  const { data: ci } = await admin.from("storage_integrations")
    .select("refresh_token, folder_id, platform_subfolder_id").eq("company_id", companyId).maybeSingle();
  if (ci?.refresh_token) return { refreshToken: ci.refresh_token as string, parent: (ci.folder_id as string) ?? null };
  const { data: ps } = await admin.from("platform_storage").select("refresh_token, folder_id").eq("id", true).maybeSingle();
  if (!ps?.refresh_token) return null;
  let sub = (ci?.platform_subfolder_id as string) ?? null;
  if (!sub) {
    const token = await driveAccessToken(ps.refresh_token);
    sub = await createFolder(token, companyName || companyId, (ps.folder_id as string) ?? null);
    if (sub) await admin.from("storage_integrations").upsert({ company_id: companyId, provider: "gdrive", platform_subfolder_id: sub, updated_at: new Date().toISOString() });
  }
  return { refreshToken: ps.refresh_token as string, parent: sub };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const callId = req.headers.get("x-call-id") ?? "";
  const source = req.headers.get("x-source") ?? "sip";
  const duration = parseInt(req.headers.get("x-duration") ?? "0", 10) || 0;
  if (!callId) return json({ ok: false, error: "missing x-call-id" }, 400);

  const auth = req.headers.get("Authorization") ?? "";
  const u = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
  const { data: ud } = await u.auth.getUser();
  if (!ud?.user) return json({ ok: false, error: "Unauthorized" }, 401);

  const { data: row } = await u.from("call_logs").select("id, company_id").eq("id", callId).maybeSingle();
  if (!row?.company_id) return json({ ok: false, error: "call not found" }, 404);

  const admin = createClient(SUPABASE_URL, SERVICE);

  // Upload the recording to the company's Google Drive when one is configured
  // (bring-your-own storage for scale); returns the Drive file id, or null if
  // Drive isn't set up / the upload fails. We then fall back to Supabase Storage
  // so recording ALWAYS works out of the box — no Google setup required.
  async function tryDrive(bytes: Uint8Array, ext: string, mime: string): Promise<string | null> {
    if (!G_CLIENT_ID || !G_CLIENT_SECRET) return null;
    const { data: comp } = await admin.from("companies").select("name").eq("id", row!.company_id).maybeSingle();
    const drive = await resolveDrive(admin, row!.company_id, comp?.name ?? "").catch(() => null);
    if (!drive) return null;
    try {
      const token = await driveAccessToken(drive.refreshToken);
      const metadata = { name: `${callId}.${ext}`, mimeType: mime, parents: drive.parent ? [drive.parent] : undefined };
      const boundary = "scb" + crypto.randomUUID().replace(/-/g, "");
      const enc = new TextEncoder();
      const pre = enc.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` + JSON.stringify(metadata) + `\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`);
      const post = enc.encode(`\r\n--${boundary}--`);
      const body = new Uint8Array(pre.length + bytes.length + post.length);
      body.set(pre, 0); body.set(bytes, pre.length); body.set(post, pre.length + bytes.length);
      const up = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` }, body,
      });
      const ud2 = await up.json();
      return (up.ok && ud2.id) ? (ud2.id as string) : null;
    } catch (_e) {
      return null;
    }
  }

  try {
    const bytes = new Uint8Array(await req.arrayBuffer());
    if (bytes.length === 0) return json({ ok: false, error: "empty body" }, 400);

    // Detect the REAL audio format from the file's magic bytes — the phone's own
    // recorder may save .amr/.mp3/.ogg, not the m4a we assumed from x-source.
    // Getting this right makes playback pick the correct decoder and lets Whisper
    // transcribe (it chooses its decoder from the file extension we give it).
    const [ext, mime] = sniffAudio(bytes, source);

    // Measured before anything is stored, so the answer exists even if Drive
    // later misbehaves. See measureAudio: this is the only number here that
    // describes the AUDIO rather than the call.
    const facts = measureAudio(bytes, ext);

    // Prefer Drive if configured; otherwise (or on Drive failure) store the
    // recording in Supabase Storage. recording_path carries an "sb://" prefix for
    // storage objects so recording-url knows where to read from; a bare id is Drive.
    const driveId = await tryDrive(bytes, ext, mime);
    let recordingPath: string;
    if (driveId) {
      recordingPath = driveId;
    } else {
      const key = `${row.company_id}/${callId}.${ext}`;
      const { error: upErr } = await admin.storage.from("call-recordings")
        .upload(key, bytes, { contentType: mime, upsert: true });
      if (upErr) {
        await markFailed(admin, callId, `Storage upload failed: ${upErr.message}`);
        return json({ ok: false, error: `Storage upload failed: ${upErr.message}` }, 502);
      }
      recordingPath = `sb://call-recordings/${key}`;
    }

    // Clear any prior error from a retried call.
    // recording_seconds stays as it was — the phone's call length — because
    // other screens already read it and changing its meaning silently would be
    // its own bug. audio_seconds is the new, honest column (migration 0216).
    //
    // An unfinished container is recorded as an ERROR even though the upload
    // itself worked. It is the truest thing we know about the file: it cannot
    // be played and it cannot be transcribed, and saying "ready" about it is
    // how a four-minute call came to show one second with nobody able to
    // explain why.
    await admin.from("call_logs").update({
      recording_path: recordingPath,
      recording_status: "ready",
      recording_seconds: duration,
      recording_source: source,
      audio_seconds: facts.seconds,
      audio_complete: facts.complete,
      recording_error: facts.complete ? null : facts.note,
    }).eq("id", callId);

    // Fire-and-forget AI summary so the admin gets it automatically. Reuses the
    // bytes already in memory (no second download) and runs in the background so
    // the phone's upload isn't blocked on Whisper/Llama.
    if (hasGroq() && bytes.length > 0) {
      const task = summarizeAndStore(admin, callId, bytes, source, ext);
      if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(task);
      else await task;
    }
    return json({ ok: true, path: recordingPath, store: driveId ? "gdrive" : "supabase" });
  } catch (e) {
    await markFailed(admin, callId, String(e));
    return json({ ok: false, error: String(e) }, 502);
  }
});
