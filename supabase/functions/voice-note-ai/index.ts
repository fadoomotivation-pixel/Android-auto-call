// The AI twist on lead voice notes: a telecaller records "kya baat hui" in
// their own voice; this transcribes it (Groq Whisper — Hindi/Hinglish OK) and
// distills a manager-ready summary + suggested lead stage (Groq Llama).
// Body: { note_id }
// Auth: any signed-in user who can see the note (RLS), or the service role.
// Secret required: GROQ_API_KEY (same as call summaries).
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
const GROQ = Deno.env.get("GROQ_API_KEY") ?? "";

const DISPOSITIONS = [
  "interested", "site_visit", "negotiation", "token_paid", "booked",
  "callback", "not_interested", "lost", "dnc",
];

const SYSTEM_PROMPT =
  "A real-estate telecaller has recorded a voice note, in their own words, " +
  "about how a call with a lead went. It may be Hindi, English or Hinglish. " +
  'Reply ONLY with JSON: {"summary": string, "disposition": string}. ' +
  "summary: clear English, max ~80 words — outcome, the customer's intent/" +
  "objections, and the telecaller's next action. " +
  "disposition: the lead's stage per this note, exactly one of " +
  `[${DISPOSITIONS.map((d) => `"${d}"`).join(", ")}] or "unknown".`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!GROQ) return json({ ok: false, error: "GROQ_API_KEY is not configured." }, 500);

  const auth = req.headers.get("Authorization") ?? "";
  const bearer = auth.replace(/^Bearer\s+/i, "").trim();
  const admin = createClient(SUPABASE_URL, SERVICE);

  const { note_id } = await req.json().catch(() => ({}));
  if (!note_id) return json({ ok: false, error: "missing note_id" }, 400);

  // Authorize: service callers skip; users must be able to SELECT the note (RLS).
  if (bearer !== SERVICE) {
    const u = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
    const { data: ud } = await u.auth.getUser();
    if (!ud?.user) return json({ ok: false, error: "Unauthorized" }, 401);
    const { data: visible } = await u.from("lead_voice_notes").select("id").eq("id", note_id).maybeSingle();
    if (!visible) return json({ ok: false, error: "Note not found" }, 404);
  }

  const { data: note } = await admin.from("lead_voice_notes")
    .select("id, audio_path, transcript, summary, ai_status").eq("id", note_id).maybeSingle();
  if (!note) return json({ ok: false, error: "Note not found" }, 404);
  if (note.ai_status === "ready" && note.summary) {
    return json({ ok: true, summary: note.summary, cached: true });
  }

  await admin.from("lead_voice_notes").update({ ai_status: "processing" }).eq("id", note_id);
  try {
    const { data: blob, error: dlErr } = await admin.storage.from("voice-notes").download(note.audio_path);
    if (dlErr || !blob) throw new Error(`audio download failed: ${dlErr?.message ?? "no data"}`);
    const bytes = new Uint8Array(await blob.arrayBuffer());

    const form = new FormData();
    form.append("model", "whisper-large-v3");
    form.append("file", new Blob([bytes], { type: "audio/mp4" }), "note.m4a");
    const tr = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST", headers: { Authorization: `Bearer ${GROQ}` }, body: form,
    });
    const trj = await tr.json();
    const transcript: string = trj.text ?? "";
    if (!transcript.trim()) throw new Error(`transcription empty: ${JSON.stringify(trj).slice(0, 200)}`);

    const ch = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST", headers: { Authorization: `Bearer ${GROQ}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile", temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Voice note transcript:\n\n${transcript.slice(0, 12000)}` },
        ],
      }),
    });
    const chj = await ch.json();
    const raw: string = chj.choices?.[0]?.message?.content ?? "";
    if (!raw.trim()) throw new Error(`summary empty: ${JSON.stringify(chj).slice(0, 200)}`);

    let summary = raw.trim();
    let disposition: string | null = null;
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed.summary === "string" && parsed.summary.trim()) summary = parsed.summary.trim();
      if (typeof parsed.disposition === "string" && DISPOSITIONS.includes(parsed.disposition)) {
        disposition = parsed.disposition;
      }
    } catch { /* keep raw as summary */ }

    await admin.from("lead_voice_notes")
      .update({ transcript, summary, suggested_disposition: disposition, ai_status: "ready" })
      .eq("id", note_id);
    return json({ ok: true, summary, disposition: disposition ?? undefined });
  } catch (e) {
    await admin.from("lead_voice_notes").update({ ai_status: "failed" }).eq("id", note_id);
    return json({ ok: false, error: String(e) }, 500);
  }
});
