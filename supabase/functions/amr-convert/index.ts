// Free server-side AMR→MP3 transcoding, driven by a GitHub Actions job (whose
// runners ship a full ffmpeg — the Supabase edge runtime can't transcode: it has
// no Web Worker, so ffmpeg.wasm won't load). Some budget phones record SIM calls
// as .amr, which Whisper can't transcribe and browsers can't play; this pipeline
// converts them to MP3 so BOTH the AI summary and web playback start working.
//
// Auth: a purpose-built AMR_SECRET (set in Supabase edge secrets AND as a GitHub
// Actions secret). It ONLY lets the caller drive AMR conversion — never the raw
// service key — so it's safe even on a public repo.
//
// Actions (POST JSON): { secret, action, ... }
//   list -> { ids }     pending AMR-candidate call_log ids
//   get  -> { base64 }  raw recording bytes for one call
//   put  -> { ok }      store the converted MP3 + regenerate the AI summary
//   skip -> { ok }      mark a non-AMR row so it isn't re-listed
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { encodeBase64, decodeBase64 } from "jsr:@std/encoding@1/base64";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const AMR_SECRET = Deno.env.get("AMR_SECRET") ?? "";
const GROQ = Deno.env.get("GROQ_API_KEY") ?? "";
const G_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") ?? "";
const G_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "";

const DISPOSITIONS = ["interested", "site_visit", "proposal", "booked", "callback", "not_interested", "dnc"];
const SYS =
  "You are a sales manager's assistant analysing a real-estate telecaller's call. " +
  "The transcript may be in Hindi, English or Hinglish. Reply ONLY with a JSON object " +
  '{"summary": string, "disposition": string}. summary: clear English, max ~120 words, ' +
  "covering the outcome, the customer's interest level (hot/warm/cold), key points, and " +
  "the next action. disposition: the lead's stage from THIS call, exactly one of " +
  `[${DISPOSITIONS.map((d) => `"${d}"`).join(", ")}] or "unknown". NEVER invent details.`;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

async function driveAccessToken(refreshToken: string): Promise<string> {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: G_CLIENT_ID, client_secret: G_CLIENT_SECRET, refresh_token: refreshToken, grant_type: "refresh_token" }),
  });
  const d = await r.json();
  if (!d.access_token) throw new Error(`Google token: ${JSON.stringify(d).slice(0, 200)}`);
  return d.access_token as string;
}
async function driveDownload(fileId: string, refreshToken: string): Promise<Uint8Array | null> {
  const token = await driveAccessToken(refreshToken);
  const m = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, { headers: { Authorization: `Bearer ${token}` } });
  if (!m.ok) return null;
  return new Uint8Array(await m.arrayBuffer());
}
async function driveUpload(refreshToken: string, parent: string | null, name: string, bytes: Uint8Array, mime: string): Promise<string | null> {
  const token = await driveAccessToken(refreshToken);
  const metadata = { name, mimeType: mime, parents: parent ? [parent] : undefined };
  const boundary = "amr" + crypto.randomUUID().replace(/-/g, "");
  const enc = new TextEncoder();
  const pre = enc.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` + JSON.stringify(metadata) + `\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`);
  const post = enc.encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(pre.length + bytes.length + post.length);
  body.set(pre, 0); body.set(bytes, pre.length); body.set(post, pre.length + bytes.length);
  const up = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` }, body,
  });
  const d = await up.json();
  return (up.ok && d.id) ? (d.id as string) : null;
}
async function driveFor(admin: SupabaseClient, companyId: string): Promise<{ rt: string; parent: string | null } | null> {
  const { data: ci } = await admin.from("storage_integrations").select("refresh_token, folder_id, platform_subfolder_id").eq("company_id", companyId).maybeSingle();
  if (ci?.refresh_token) return { rt: ci.refresh_token as string, parent: (ci.folder_id as string) ?? null };
  const { data: ps } = await admin.from("platform_storage").select("refresh_token").eq("id", true).maybeSingle();
  if (ps?.refresh_token) return { rt: ps.refresh_token as string, parent: (ci?.platform_subfolder_id as string) ?? null };
  return null;
}

// Transcribe the MP3 with Groq Whisper + summarise with Llama. Minimal on
// purpose (summary + disposition only) — this backfills OLD calls, so it must
// NOT retroactively create follow-ups/budget changes the way the live path does.
async function summarizeMp3(admin: SupabaseClient, callId: string, mp3: Uint8Array): Promise<boolean> {
  if (!GROQ) return false;
  await admin.from("call_logs").update({ summary_status: "processing" }).eq("id", callId);
  try {
    const form = new FormData();
    form.append("model", "whisper-large-v3");
    form.append("file", new Blob([mp3], { type: "audio/mpeg" }), "rec.mp3");
    const tr = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${GROQ}` }, body: form });
    const transcript: string = (await tr.json()).text ?? "";
    if (!transcript.trim()) throw new Error("empty transcript");
    const { data: callRow } = await admin.from("call_logs").select("started_at, created_at").eq("id", callId).maybeSingle();
    const callMs = Date.parse(callRow?.started_at ?? callRow?.created_at ?? "") || Date.now();
    const callIst = new Date(callMs + 5.5 * 3600 * 1000).toISOString().replace("Z", "+05:30");
    const ch = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST", headers: { Authorization: `Bearer ${GROQ}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile", temperature: 0.3, response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYS },
          { role: "user", content: `The call took place at: ${callIst} (IST, India).\n\nCall transcript:\n\n${transcript.slice(0, 12000)}` },
        ],
      }),
    });
    const rawc: string = (await ch.json()).choices?.[0]?.message?.content ?? "";
    let summary = rawc.trim(); let disposition: string | null = null;
    try {
      const p = JSON.parse(rawc);
      if (typeof p.summary === "string" && p.summary.trim()) summary = p.summary.trim();
      if (typeof p.disposition === "string" && DISPOSITIONS.includes(p.disposition)) disposition = p.disposition;
    } catch { /* keep raw */ }
    await admin.from("call_logs").update({ transcript, summary, suggested_disposition: disposition, summary_status: "ready" }).eq("id", callId);
    return true;
  } catch (_e) {
    await admin.from("call_logs").update({ summary_status: "failed" }).eq("id", callId);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const body = await req.json().catch(() => ({}));
  if (!AMR_SECRET || body.secret !== AMR_SECRET) return json({ ok: false, error: "unauthorized" }, 401);
  const admin = createClient(SUPABASE_URL, SERVICE);
  const action = body.action as string;

  try {
    if (action === "list") {
      const { data } = await admin.from("call_logs")
        .select("id")
        .eq("recording_status", "ready").eq("recording_source", "sim")
        .in("summary_status", ["failed", "unsupported"])
        .filter("extra->>amr_state", "is", null)
        .limit(Math.min(Math.max(Number(body.limit) || 25, 1), 100));
      return json({ ok: true, ids: (data ?? []).map((r) => r.id) });
    }

    if (action === "get") {
      const { data: row } = await admin.from("call_logs").select("company_id, recording_path").eq("id", body.id).maybeSingle();
      if (!row?.recording_path) return json({ ok: false, error: "no recording" }, 404);
      const path = row.recording_path as string;
      let bytes: Uint8Array | null = null;
      if (path.startsWith("sb://")) {
        const rest = path.slice(5); const slash = rest.indexOf("/");
        const { data: blob } = await admin.storage.from(rest.slice(0, slash)).download(rest.slice(slash + 1));
        if (blob) bytes = new Uint8Array(await blob.arrayBuffer());
      } else {
        const d = await driveFor(admin, row.company_id as string);
        if (d) bytes = await driveDownload(path, d.rt);
      }
      if (!bytes) return json({ ok: false, error: "download failed" }, 502);
      return json({ ok: true, base64: encodeBase64(bytes) });
    }

    if (action === "put") {
      const mp3 = decodeBase64(body.base64 ?? "");
      if (mp3.length === 0) return json({ ok: false, error: "empty mp3" }, 400);
      const { data: row } = await admin.from("call_logs").select("company_id, recording_path, extra").eq("id", body.id).maybeSingle();
      if (!row) return json({ ok: false, error: "not found" }, 404);
      let newPath: string | null = null;
      const d = await driveFor(admin, row.company_id as string);
      if (d) {
        const id = await driveUpload(d.rt, d.parent, `${body.id}-mp3.mp3`, mp3, "audio/mpeg");
        if (id) newPath = id;
      }
      if (!newPath) {
        const key = `${row.company_id}/${body.id}-mp3.mp3`;
        const { error } = await admin.storage.from("call-recordings").upload(key, mp3, { contentType: "audio/mpeg", upsert: true });
        if (error) return json({ ok: false, error: `storage: ${error.message}` }, 502);
        newPath = `sb://call-recordings/${key}`;
      }
      const extra = { ...((row.extra as Record<string, unknown>) ?? {}), amr_state: "converted", amr_orig: row.recording_path };
      await admin.from("call_logs").update({ recording_path: newPath, recording_status: "ready", recording_error: null, extra }).eq("id", body.id);
      const summarized = await summarizeMp3(admin, body.id, mp3);
      return json({ ok: true, path: newPath, summarized });
    }

    if (action === "skip") {
      const { data: row } = await admin.from("call_logs").select("extra").eq("id", body.id).maybeSingle();
      const extra = { ...((row?.extra as Record<string, unknown>) ?? {}), amr_state: "skipped" };
      await admin.from("call_logs").update({ extra }).eq("id", body.id);
      return json({ ok: true });
    }

    return json({ ok: false, error: "unknown action" }, 400);
  } catch (e) {
    return json({ ok: false, error: String(e).slice(0, 300) }, 500);
  }
});
