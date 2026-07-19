// On-demand AI call summary: fetches a recording from Drive and runs the
// shared Groq Whisper + Llama summarizer. Used by the admin web and by the
// telecaller app (a rep may summarize their OWN calls). Body: { call_log_id }
// Secret required: GROQ_API_KEY  (free tier at console.groq.com)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { hasGroq, summarizeAndStore } from "../_shared/summarize.ts";

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
async function fetchMedia(fileId: string, refreshToken: string): Promise<Uint8Array | null> {
  const token = await driveAccessToken(refreshToken);
  if (!token) return null;
  const m = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, { headers: { Authorization: `Bearer ${token}` } });
  if (!m.ok) return null;
  return new Uint8Array(await m.arrayBuffer());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!hasGroq()) return json({ ok: false, error: "GROQ_API_KEY is not configured." }, 500);

  const auth = req.headers.get("Authorization") ?? "";
  const u = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
  const { data: ud } = await u.auth.getUser();
  if (!ud?.user) return json({ ok: false, error: "Unauthorized" }, 401);

  const { call_log_id } = await req.json().catch(() => ({}));
  if (!call_log_id) return json({ ok: false, error: "missing call_log_id" }, 400);

  const { data: row } = await u.from("call_logs")
    .select("company_id, salesperson_id, recording_path, recording_status, recording_source, summary")
    .eq("id", call_log_id).maybeSingle();
  if (!row || row.recording_status !== "ready" || !row.recording_path) return json({ ok: false, error: "No ready recording for this call." }, 404);
  if (row.summary) return json({ ok: true, summary: row.summary, cached: true });

  // Authorize: admins, platform super-admins, or the rep who owns the call.
  const isOwner = row.salesperson_id === ud.user.id;
  if (!isOwner) {
    const { data: prof } = await u.from("profiles").select("role").eq("id", ud.user.id).maybeSingle();
    const { data: pa } = await u.from("platform_admins").select("user_id").eq("user_id", ud.user.id).maybeSingle();
    if (prof?.role !== "admin" && !pa) return json({ ok: false, error: "Not allowed for this call." }, 403);
  }

  const admin = createClient(SUPABASE_URL, SERVICE);
  let bytes: Uint8Array | null = null;
  let extHint: string | undefined;

  // Supabase Storage object ("sb://<bucket>/<key>") — the default store when no
  // Drive is configured. Read it directly; the key's extension tells Whisper
  // which decoder to use.
  const path = row.recording_path as string;
  if (path.startsWith("sb://")) {
    const rest = path.slice("sb://".length);
    const slash = rest.indexOf("/");
    const key = rest.slice(slash + 1);
    const { data: blob } = await admin.storage.from(rest.slice(0, slash)).download(key);
    if (blob) bytes = new Uint8Array(await blob.arrayBuffer());
    const dot = key.lastIndexOf(".");
    if (dot >= 0) extHint = key.slice(dot + 1).toLowerCase();
    if (!bytes) return json({ ok: false, error: "could not fetch recording from storage" });
  } else {
    const { data: ci } = await admin.from("storage_integrations").select("refresh_token").eq("company_id", row.company_id).maybeSingle();
    const { data: ps } = await admin.from("platform_storage").select("refresh_token").eq("id", true).maybeSingle();
    if (ci?.refresh_token) bytes = await fetchMedia(path, ci.refresh_token);
    if (!bytes && ps?.refresh_token) bytes = await fetchMedia(path, ps.refresh_token);
    if (!bytes) return json({ ok: false, error: "could not fetch recording from Drive" });
  }

  const res = await summarizeAndStore(admin, call_log_id, bytes, row.recording_source ?? "sip", extHint);
  return json(res, res.ok ? 200 : 500);
});
