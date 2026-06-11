// Streams a recording back to an authorised listener. Access is gated by the
// same call_logs RLS (telecaller = own, admin = company, super-admin = all):
// we read the row with the caller's JWT first, and only then fetch from Drive.
//
// Body: { call_log_id }
// Returns: the audio bytes (audio/x-matroska) so the browser can play them.
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
  if (!d.access_token) throw new Error("google token");
  return d.access_token as string;
}

function err(o: unknown, s = 400) {
  return new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const auth = req.headers.get("Authorization") ?? "";
  const u = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
  const { data: ud } = await u.auth.getUser();
  if (!ud?.user) return err({ ok: false, error: "Unauthorized" }, 401);

  const { call_log_id } = await req.json().catch(() => ({}));
  if (!call_log_id) return err({ ok: false, error: "missing call_log_id" });

  // RLS decides whether this user may see this row.
  const { data: row } = await u
    .from("call_logs").select("company_id, recording_path, recording_status").eq("id", call_log_id).maybeSingle();
  if (!row || row.recording_status !== "ready" || !row.recording_path) {
    return err({ ok: false, error: "not available" }, 404);
  }

  const admin = createClient(SUPABASE_URL, SERVICE);
  const { data: integ } = await admin
    .from("storage_integrations").select("refresh_token").eq("company_id", row.company_id).maybeSingle();
  if (!integ?.refresh_token) return err({ ok: false, error: "storage not connected" });

  try {
    const token = await driveAccessToken(integ.refresh_token);
    const media = await fetch(
      `https://www.googleapis.com/drive/v3/files/${row.recording_path}?alt=media`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!media.ok) return err({ ok: false, error: "drive fetch failed" }, 502);
    return new Response(media.body, {
      status: 200,
      headers: { ...cors, "Content-Type": "audio/x-matroska", "Cache-Control": "private, max-age=300" },
    });
  } catch (e) {
    return err({ ok: false, error: String(e) }, 500);
  }
});
