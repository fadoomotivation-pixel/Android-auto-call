// Receives a call recording (binary body) from the app, streams it to the
// company's Google Drive folder, and marks the call_logs row ready.
//
// Headers: x-call-id (call_logs.id), x-source ('sip'|'sim'), x-duration (seconds)
// Body: the audio bytes (e.g. audio/x-matroska)
//
// Secrets required: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
// Per-company storage_integrations row holds: refresh_token, folder_id
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-call-id, x-source, x-duration",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(o: unknown, s = 200) {
  return new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const G_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") ?? "";
const G_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "";

async function driveAccessToken(refreshToken: string): Promise<string> {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: G_CLIENT_ID,
      client_secret: G_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const d = await r.json();
  if (!d.access_token) throw new Error(`Google token: ${JSON.stringify(d)}`);
  return d.access_token as string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const callId = req.headers.get("x-call-id") ?? "";
  const source = req.headers.get("x-source") ?? "sip";
  const duration = parseInt(req.headers.get("x-duration") ?? "0", 10) || 0;
  if (!callId) return json({ ok: false, error: "missing x-call-id" }, 400);

  // Who is calling? (RLS-scoped client.)
  const auth = req.headers.get("Authorization") ?? "";
  const u = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
  const { data: ud } = await u.auth.getUser();
  if (!ud?.user) return json({ ok: false, error: "Unauthorized" }, 401);

  // The user may only attach a recording to a call log they can see (RLS).
  const { data: row } = await u.from("call_logs").select("id, company_id").eq("id", callId).maybeSingle();
  if (!row?.company_id) return json({ ok: false, error: "call not found" }, 404);

  const admin = createClient(SUPABASE_URL, SERVICE);
  const { data: integ } = await admin
    .from("storage_integrations").select("refresh_token, folder_id").eq("company_id", row.company_id).maybeSingle();
  if (!integ?.refresh_token) {
    await admin.from("call_logs").update({ recording_status: "failed" }).eq("id", callId);
    return json({ ok: false, error: "Google Drive not connected for this company." });
  }

  try {
    const bytes = new Uint8Array(await req.arrayBuffer());
    if (bytes.length === 0) return json({ ok: false, error: "empty body" }, 400);

    const token = await driveAccessToken(integ.refresh_token);
    const ext = source === "sim" ? "m4a" : "wav";
    const mime = source === "sim" ? "audio/mp4" : "audio/wav";
    const metadata = {
      name: `${callId}.${ext}`,
      mimeType: mime,
      parents: integ.folder_id ? [integ.folder_id] : undefined,
    };

    // Multipart upload (metadata + media) in one request.
    const boundary = "scb" + crypto.randomUUID().replace(/-/g, "");
    const enc = new TextEncoder();
    const pre = enc.encode(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
        JSON.stringify(metadata) +
        `\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`,
    );
    const post = enc.encode(`\r\n--${boundary}--`);
    const body = new Uint8Array(pre.length + bytes.length + post.length);
    body.set(pre, 0);
    body.set(bytes, pre.length);
    body.set(post, pre.length + bytes.length);

    const up = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    });
    const ud2 = await up.json();
    if (!up.ok || !ud2.id) {
      await admin.from("call_logs").update({ recording_status: "failed" }).eq("id", callId);
      return json({ ok: false, error: `Drive upload failed: ${JSON.stringify(ud2)}` });
    }

    await admin.from("call_logs").update({
      recording_path: ud2.id,
      recording_status: "ready",
      recording_seconds: duration,
      recording_source: source,
    }).eq("id", callId);

    return json({ ok: true, file_id: ud2.id });
  } catch (e) {
    await admin.from("call_logs").update({ recording_status: "failed" }).eq("id", callId);
    return json({ ok: false, error: String(e) });
  }
});
