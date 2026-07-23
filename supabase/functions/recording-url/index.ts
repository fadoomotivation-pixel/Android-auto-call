// Streams a recording back to an authorised listener (RLS on call_logs:
// telecaller = own, admin = company, super = all). For cloud-telephony calls
// (CallerDesk) the audio lives at an external recording_url, so we proxy those
// bytes directly; otherwise we read from the company's Drive if it has one,
// else the platform (super-admin) Drive.
// Body: { call_log_id }  → audio bytes
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const G_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") ?? "";
const G_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "";

async function driveAccessToken(refreshToken: string): Promise<string> {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: G_CLIENT_ID, client_secret: G_CLIENT_SECRET, refresh_token: refreshToken, grant_type: "refresh_token" }),
  });
  const d = await r.json();
  if (!d.access_token) throw new Error("google token");
  return d.access_token as string;
}

function err(o: unknown, s = 400) {
  return new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
}

async function fetchMedia(fileId: string, refreshToken: string): Promise<Response | null> {
  const token = await driveAccessToken(refreshToken).catch(() => null);
  if (!token) return null;
  const media = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, { headers: { Authorization: `Bearer ${token}` } });
  return media.ok ? media : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const auth = req.headers.get("Authorization") ?? "";
  const u = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
  const { data: ud } = await u.auth.getUser();
  if (!ud?.user) return err({ ok: false, error: "Unauthorized" }, 401);

  const { call_log_id } = await req.json().catch(() => ({}));
  if (!call_log_id) return err({ ok: false, error: "missing call_log_id" });

  const { data: row } = await u.from("call_logs").select("company_id, recording_path, recording_url, recording_status, recording_source").eq("id", call_log_id).maybeSingle();
  if (!row || row.recording_status !== "ready" || (!row.recording_path && !row.recording_url)) {
    return err({ ok: false, error: "not available" }, 404);
  }
  const contentType = row.recording_source === "sim" ? "audio/mp4" : "audio/wav";

  // Cloud telephony (CallerDesk): no Drive file, just an external recording URL.
  // Proxy its bytes so the client stays RLS-gated and never sees the raw URL.
  if (!row.recording_path && row.recording_url) {
    try {
      const ext = await fetch(row.recording_url as string);
      if (!ext.ok || !ext.body) return err({ ok: false, error: "recording fetch failed" }, 502);
      return new Response(ext.body, {
        status: 200,
        headers: { ...cors, "Content-Type": ext.headers.get("Content-Type") ?? contentType, "Cache-Control": "private, max-age=300" },
      });
    } catch (e) {
      return err({ ok: false, error: String(e) }, 502);
    }
  }

  const admin = createClient(SUPABASE_URL, SERVICE);

  // Supabase Storage object (default store, no Google needed): recording_path is
  // "sb://<bucket>/<key>". Download with the service role and stream it back —
  // access is already gated by the call_logs RLS check on `u` above.
  if (typeof row.recording_path === "string" && row.recording_path.startsWith("sb://")) {
    const rest = row.recording_path.slice("sb://".length);
    const slash = rest.indexOf("/");
    const bucket = rest.slice(0, slash);
    const key = rest.slice(slash + 1);
    const { data: blob, error } = await admin.storage.from(bucket).download(key);
    if (error || !blob) return err({ ok: false, error: "storage fetch failed" }, 502);
    // Serve the true content-type from the object's real extension (amr/m4a/…)
    // so the player picks the right decoder.
    const dot = key.lastIndexOf(".");
    const kext = dot >= 0 ? key.slice(dot + 1).toLowerCase() : "";
    const byExt: Record<string, string> = {
      amr: "audio/amr", m4a: "audio/mp4", mp4: "audio/mp4", mp3: "audio/mpeg",
      wav: "audio/wav", ogg: "audio/ogg", flac: "audio/flac", webm: "audio/webm",
    };
    return new Response(blob.stream(), {
      status: 200,
      headers: { ...cors, "Content-Type": byExt[kext] ?? contentType, "Cache-Control": "private, max-age=300" },
    });
  }

  const { data: ci } = await admin.from("storage_integrations").select("refresh_token").eq("company_id", row.company_id).maybeSingle();
  const { data: ps } = await admin.from("platform_storage").select("refresh_token").eq("id", true).maybeSingle();

  try {
    let media: Response | null = null;
    if (ci?.refresh_token) media = await fetchMedia(row.recording_path, ci.refresh_token);
    if (!media && ps?.refresh_token) media = await fetchMedia(row.recording_path, ps.refresh_token);
    if (!media) return err({ ok: false, error: "drive fetch failed" }, 502);
    // Trust the file's REAL stored mimeType from Drive, not a source-based guess.
    // A .amr recorded on SIM gets transcoded to MP3 (audio/mpeg) by the amr pipeline,
    // but recording_source stays "sim" — serving the old hardcoded "audio/mp4" made
    // browsers try to decode MP3 bytes as AAC/MP4 and fail ("Could not play the audio
    // file" / garbled). ExoPlayer sniffs and works, which hid this on the app.
    const driveCt = (media.headers.get("Content-Type") ?? "").split(";")[0].trim().toLowerCase();
    const ct = driveCt.startsWith("audio/") ? driveCt : contentType;
    return new Response(media.body, { status: 200, headers: { ...cors, "Content-Type": ct, "Cache-Control": "private, max-age=300" } });
  } catch (e) {
    return err({ ok: false, error: String(e) }, 500);
  }
});
