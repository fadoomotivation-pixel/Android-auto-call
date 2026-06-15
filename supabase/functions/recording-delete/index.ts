// Deletes a recording from Drive and clears the row. SUPER-ADMIN ONLY
// (company admins & telecallers can listen but not delete). Body: { call_log_id }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

async function driveAccessToken(refreshToken: string): Promise<string | null> {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: G_CLIENT_ID, client_secret: G_CLIENT_SECRET, refresh_token: refreshToken, grant_type: "refresh_token" }),
  });
  return (await r.json()).access_token ?? null;
}
async function tryDelete(fileId: string, refreshToken: string) {
  const token = await driveAccessToken(refreshToken);
  if (!token) return false;
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
  return r.ok || r.status === 404;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const auth = req.headers.get("Authorization") ?? "";
  const u = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
  const { data: ud } = await u.auth.getUser();
  if (!ud?.user) return json({ ok: false, error: "Unauthorized" }, 401);

  const { call_log_id } = await req.json().catch(() => ({}));
  if (!call_log_id) return json({ ok: false, error: "missing call_log_id" }, 400);

  // Super-admin only.
  const { data: pa } = await u.from("platform_admins").select("user_id").eq("user_id", ud.user.id).maybeSingle();
  if (!pa) return json({ ok: false, error: "Only the super admin can delete recordings." }, 403);

  const admin = createClient(SUPABASE_URL, SERVICE);
  const { data: row } = await admin.from("call_logs").select("company_id, recording_path").eq("id", call_log_id).maybeSingle();
  if (!row) return json({ ok: false, error: "not found" }, 404);

  if (row.recording_path) {
    const { data: ci } = await admin.from("storage_integrations").select("refresh_token").eq("company_id", row.company_id).maybeSingle();
    const { data: ps } = await admin.from("platform_storage").select("refresh_token").eq("id", true).maybeSingle();
    let done = false;
    if (ci?.refresh_token) done = await tryDelete(row.recording_path, ci.refresh_token).catch(() => false);
    if (!done && ps?.refresh_token) await tryDelete(row.recording_path, ps.refresh_token).catch(() => false);
  }
  await admin.from("call_logs").update({ recording_path: null, recording_status: "deleted" }).eq("id", call_log_id);
  return json({ ok: true });
});
