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
  return source === "sim" ? ["m4a", "audio/mp4"] : ["wav", "audio/wav"];
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
    await admin.from("call_logs").update({ recording_path: recordingPath, recording_status: "ready", recording_seconds: duration, recording_source: source, recording_error: null }).eq("id", callId);

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
