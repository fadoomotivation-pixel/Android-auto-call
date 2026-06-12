// AI call summary: transcribes a recording (Groq Whisper) and summarizes it
// (Groq Llama) for the admin. Stores transcript + summary on the call_logs row.
// Admin / super-admin only. Body: { call_log_id }
// Secret required: GROQ_API_KEY  (free tier at console.groq.com)
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
const GROQ = Deno.env.get("GROQ_API_KEY") ?? "";

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
  if (!GROQ) return json({ ok: false, error: "GROQ_API_KEY is not configured." }, 500);

  const auth = req.headers.get("Authorization") ?? "";
  const u = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
  const { data: ud } = await u.auth.getUser();
  if (!ud?.user) return json({ ok: false, error: "Unauthorized" }, 401);

  const { call_log_id } = await req.json().catch(() => ({}));
  if (!call_log_id) return json({ ok: false, error: "missing call_log_id" }, 400);

  const { data: prof } = await u.from("profiles").select("role").eq("id", ud.user.id).maybeSingle();
  const { data: pa } = await u.from("platform_admins").select("user_id").eq("user_id", ud.user.id).maybeSingle();
  if (prof?.role !== "admin" && !pa) return json({ ok: false, error: "Admins only." }, 403);

  const { data: row } = await u.from("call_logs").select("company_id, recording_path, recording_status, recording_source, summary").eq("id", call_log_id).maybeSingle();
  if (!row || row.recording_status !== "ready" || !row.recording_path) return json({ ok: false, error: "No ready recording for this call." }, 404);
  if (row.summary) return json({ ok: true, summary: row.summary, cached: true });

  const admin = createClient(SUPABASE_URL, SERVICE);
  await admin.from("call_logs").update({ summary_status: "processing" }).eq("id", call_log_id);

  try {
    const { data: ci } = await admin.from("storage_integrations").select("refresh_token").eq("company_id", row.company_id).maybeSingle();
    const { data: ps } = await admin.from("platform_storage").select("refresh_token").eq("id", true).maybeSingle();
    let bytes: Uint8Array | null = null;
    if (ci?.refresh_token) bytes = await fetchMedia(row.recording_path, ci.refresh_token);
    if (!bytes && ps?.refresh_token) bytes = await fetchMedia(row.recording_path, ps.refresh_token);
    if (!bytes) throw new Error("could not fetch recording from Drive");

    const ext = row.recording_source === "sim" ? "m4a" : "wav";
    const mime = row.recording_source === "sim" ? "audio/mp4" : "audio/wav";
    const form = new FormData();
    form.append("model", "whisper-large-v3");
    form.append("file", new Blob([bytes], { type: mime }), `rec.${ext}`);
    const tr = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${GROQ}` }, body: form });
    const trj = await tr.json();
    const transcript: string = trj.text ?? "";
    if (!transcript.trim()) throw new Error(`transcription empty: ${JSON.stringify(trj).slice(0, 200)}`);

    const ch = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST", headers: { Authorization: `Bearer ${GROQ}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile", temperature: 0.3,
        messages: [
          { role: "system", content: "You are a sales manager's assistant. Summarize a real-estate telecaller's call. The transcript may be in Hindi, English or Hinglish. Reply in clear English with: 1) one-line outcome, 2) customer interest level (hot/warm/cold), 3) key points discussed, 4) the next action for the telecaller. Be concise (max ~120 words)." },
          { role: "user", content: `Call transcript:\n\n${transcript.slice(0, 12000)}` },
        ],
      }),
    });
    const chj = await ch.json();
    const summary: string = chj.choices?.[0]?.message?.content ?? "";
    if (!summary.trim()) throw new Error(`summary empty: ${JSON.stringify(chj).slice(0, 200)}`);

    await admin.from("call_logs").update({ transcript, summary, summary_status: "ready" }).eq("id", call_log_id);
    return json({ ok: true, summary });
  } catch (e) {
    await admin.from("call_logs").update({ summary_status: "failed" }).eq("id", call_log_id);
    return json({ ok: false, error: String(e) });
  }
});
