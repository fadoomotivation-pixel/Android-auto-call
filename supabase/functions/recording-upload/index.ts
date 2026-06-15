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
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
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
  const { data: comp } = await admin.from("companies").select("name").eq("id", row.company_id).maybeSingle();
  const drive = await resolveDrive(admin, row.company_id, comp?.name ?? "");
  if (!drive) {
    await admin.from("call_logs").update({ recording_status: "failed" }).eq("id", callId);
    return json({ ok: false, error: "No Google Drive connected (company or platform)." });
  }

  try {
    const bytes = new Uint8Array(await req.arrayBuffer());
    if (bytes.length === 0) return json({ ok: false, error: "empty body" }, 400);
    const token = await driveAccessToken(drive.refreshToken);
    const ext = source === "sim" ? "m4a" : "wav";
    const mime = source === "sim" ? "audio/mp4" : "audio/wav";
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
    if (!up.ok || !ud2.id) {
      await admin.from("call_logs").update({ recording_status: "failed" }).eq("id", callId);
      return json({ ok: false, error: `Drive upload failed: ${JSON.stringify(ud2)}` });
    }
    await admin.from("call_logs").update({ recording_path: ud2.id, recording_status: "ready", recording_seconds: duration, recording_source: source }).eq("id", callId);

    // Fire-and-forget AI summary so the admin gets it automatically. Reuses the
    // bytes already in memory (no second Drive download) and runs in the
    // background so the phone's upload isn't blocked on Whisper/Llama.
    if (hasGroq() && bytes.length > 0) {
      const task = summarizeAndStore(admin, callId, bytes, source);
      if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(task);
      else await task;
    }
    return json({ ok: true, file_id: ud2.id });
  } catch (e) {
    await admin.from("call_logs").update({ recording_status: "failed" }).eq("id", callId);
    return json({ ok: false, error: String(e) });
  }
});
