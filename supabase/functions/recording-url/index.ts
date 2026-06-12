// Streams a recording back to an authorised listener (RLS on call_logs:
// telecaller = own, admin = company, super = all). Reads from the company's
// Drive if it has one, else the platform (super-admin) Drive.
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

  const { data: row } = await u.from("call_logs").select("company_id, recording_path, recording_status, recording_source").eq("id", call_log_id).maybeSingle();
  if (!row || row.recording_status !== "ready" || !row.recording_path) return err({ ok: false, error: "not available" }, 404);
  const contentType = row.recording_source === "sim" ? "audio/mp4" : "audio/wav";

  const admin = createClient(SUPABASE_URL, SERVICE);
  const { data: ci } = await admin.from("storage_integrations").select("refresh_token").eq("company_id", row.company_id).maybeSingle();
  const { data: ps } = await admin.from("platform_storage").select("refresh_token").eq("id", true).maybeSingle();

  try {
    let media: Response | null = null;
    if (ci?.refresh_token) media = await fetchMedia(row.recording_path, ci.refresh_token);
    if (!media && ps?.refresh_token) media = await fetchMedia(row.recording_path, ps.refresh_token);
    if (!media) return err({ ok: false, error: "drive fetch failed" }, 502);
    return new Response(media.body, { status: 200, headers: { ...cors, "Content-Type": contentType, "Cache-Control": "private, max-age=300" } });
  } catch (e) {
    return err({ ok: false, error: String(e) }, 500);
  }
});
