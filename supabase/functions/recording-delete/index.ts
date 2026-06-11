// Deletes a recording from Drive and clears the row. Admin + super-admin only.
// Body: { call_log_id }
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

async function driveAccessToken(refreshToken: string): Promise<string> {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: G_CLIENT_ID, client_secret: G_CLIENT_SECRET,
      refresh_token: refreshToken, grant_type: "refresh_token",
    }),
  });
  return (await r.json()).access_token as string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const auth = req.headers.get("Authorization") ?? "";
  const u = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
  const { data: ud } = await u.auth.getUser();
  if (!ud?.user) return json({ ok: false, error: "Unauthorized" }, 401);

  const { call_log_id } = await req.json().catch(() => ({}));
  if (!call_log_id) return json({ ok: false, error: "missing call_log_id" }, 400);

  // Must be an admin (of this company, enforced via RLS on the row) or super-admin.
  const { data: prof } = await u.from("profiles").select("role").eq("id", ud.user.id).maybeSingle();
  const { data: pa } = await u.from("platform_admins").select("user_id").eq("user_id", ud.user.id).maybeSingle();
  const isAdmin = prof?.role === "admin";
  const isSuper = !!pa;
  if (!isAdmin && !isSuper) return json({ ok: false, error: "Admins only." }, 403);

  // Reading with the caller's JWT enforces company scoping for admins.
  const { data: row } = await u
    .from("call_logs").select("company_id, recording_path").eq("id", call_log_id).maybeSingle();
  if (!row) return json({ ok: false, error: "not found" }, 404);

  const admin = createClient(SUPABASE_URL, SERVICE);
  if (row.recording_path) {
    const { data: integ } = await admin
      .from("storage_integrations").select("refresh_token").eq("company_id", row.company_id).maybeSingle();
    if (integ?.refresh_token) {
      try {
        const token = await driveAccessToken(integ.refresh_token);
        await fetch(`https://www.googleapis.com/drive/v3/files/${row.recording_path}`, {
          method: "DELETE", headers: { Authorization: `Bearer ${token}` },
        });
      } catch (_) { /* best-effort; still clear the row */ }
    }
  }
  await admin.from("call_logs")
    .update({ recording_path: null, recording_status: "deleted" }).eq("id", call_log_id);
  return json({ ok: true });
});
