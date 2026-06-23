// Shared AI call-summary logic (Groq Whisper + Llama), used by both the
// recording-upload function (auto, in the background once a recording lands)
// and the call-summary function (on-demand from the admin web / the app).
// Free tier: console.groq.com → GROQ_API_KEY secret.
import { type SupabaseClient } from "jsr:@supabase/supabase-js@2";

const GROQ = Deno.env.get("GROQ_API_KEY") ?? "";
export const hasGroq = () => !!GROQ;

// Canonical lead stages the AI may suggest (mirror of the app's SETTABLE_STAGES).
const DISPOSITIONS = [
  "interested", "site_visit", "proposal", "booked",
  "callback", "not_interested", "dnc",
];

const SYSTEM_PROMPT =
  "You are a sales manager's assistant analysing a real-estate telecaller's " +
  "call. The transcript may be in Hindi, English or Hinglish. Reply ONLY with " +
  "a JSON object of the form " +
  '{"summary": string, "disposition": string}. ' +
  "summary: clear English, max ~120 words, covering 1) one-line outcome, " +
  "2) customer interest level (hot/warm/cold), 3) key points discussed, " +
  "4) the next action for the telecaller. " +
  "disposition: the lead's stage based on THIS call, exactly one of " +
  `[${DISPOSITIONS.map((d) => `"${d}"`).join(", ")}] or "unknown" if unclear.`;

/** Transcribe + summarize the given audio bytes and store both on the row. */
export async function summarizeAndStore(
  admin: SupabaseClient,
  callId: string,
  bytes: Uint8Array,
  source: string,
): Promise<{ ok: boolean; summary?: string; disposition?: string; error?: string }> {
  if (!GROQ) return { ok: false, error: "GROQ_API_KEY is not configured." };
  await admin.from("call_logs").update({ summary_status: "processing" }).eq("id", callId);
  try {
    // Whisper picks the decoder from the filename extension, so name the upload
    // to match the source's real container.
    const FMT: Record<string, [string, string]> = {
      sim: ["m4a", "audio/mp4"],
      callerdesk: ["wav", "audio/wav"], // CallerDesk recordings are .wav
    };
    const [ext, mime] = FMT[source] ?? ["wav", "audio/wav"];

    const form = new FormData();
    form.append("model", "whisper-large-v3");
    form.append("file", new Blob([bytes], { type: mime }), `rec.${ext}`);
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
          { role: "user", content: `Call transcript:\n\n${transcript.slice(0, 12000)}` },
        ],
      }),
    });
    const chj = await ch.json();
    const raw: string = chj.choices?.[0]?.message?.content ?? "";
    if (!raw.trim()) throw new Error(`summary empty: ${JSON.stringify(chj).slice(0, 200)}`);

    // Parse the JSON reply; fall back to treating the whole reply as the summary.
    let summary = raw.trim();
    let disposition: string | null = null;
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed.summary === "string" && parsed.summary.trim()) summary = parsed.summary.trim();
      if (typeof parsed.disposition === "string" && DISPOSITIONS.includes(parsed.disposition)) {
        disposition = parsed.disposition;
      }
    } catch { /* keep raw as summary, no disposition */ }

    await admin.from("call_logs")
      .update({ transcript, summary, suggested_disposition: disposition, summary_status: "ready" })
      .eq("id", callId);
    return { ok: true, summary, disposition: disposition ?? undefined };
  } catch (e) {
    await admin.from("call_logs").update({ summary_status: "failed" }).eq("id", callId);
    return { ok: false, error: String(e) };
  }
}
