// Shared AI call-summary logic (Groq Whisper + Llama), used by both the
// recording-upload function (auto, in the background once a recording lands)
// and the call-summary function (on-demand from the admin web / the app).
// Free tier: console.groq.com → GROQ_API_KEY secret.
import { type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { DISPOSITIONS } from "./stage.ts";

const GROQ = Deno.env.get("GROQ_API_KEY") ?? "";
export const hasGroq = () => !!GROQ;


const SYSTEM_PROMPT =
  "You are a sales manager's assistant analysing a real-estate telecaller's " +
  "call. The transcript may be in Hindi, English or Hinglish. Reply ONLY with " +
  "a JSON object of the form " +
  '{"summary": string, "disposition": string, "wada": {"promise_at": string|null, ' +
  '"promise_note": string|null, "budget": string|null, "preferences": string|null, ' +
  '"objections": string[], "timeline": string|null}}. ' +
  "summary: clear English, max ~120 words, covering 1) one-line outcome, " +
  "2) customer interest level (hot/warm/cold), 3) key points discussed, " +
  "4) the next action for the telecaller. " +
  "disposition: the lead's stage based on THIS call, exactly one of " +
  `[${DISPOSITIONS.map((d) => `"${d}"`).join(", ")}] or "unknown" if unclear. ` +
  "wada ('promise') captures COMMITMENTS spoken on the call so the CRM can keep " +
  "them automatically: promise_at = if the telecaller or customer agreed on a " +
  "specific future date/time to talk again ('Saturday ko 11 baje call karunga', " +
  "'kal shaam ko baat karte hain'), resolve it RELATIVE TO THE CALL TIME you are " +
  "given, into an ISO 8601 datetime with +05:30 offset; null if no specific time " +
  "was agreed. If a day is mentioned without a time, use 11:00. promise_note = " +
  "5-10 words on what was promised, in simple Indian English. budget = customer's stated " +
  "budget verbatim-ish (e.g. \"45-50 lakh\"), null if not mentioned. preferences " +
  "= one short line (e.g. \"2BHK, ready-to-move, Noida Ext\"), null if none. " +
  "objections = 0-3 items, each 2-6 words (e.g. \"loan approval pending\"). " +
  "timeline = when they want to buy (e.g. \"Diwali tak\"), null if unsaid. " +
  "NEVER invent details that are not in the transcript.";

/** The extracted commitments/facts from one call ("wada" = promise). */
type Wada = {
  promise_at: string | null;
  promise_note: string | null;
  budget: string | null;
  preferences: string | null;
  objections: string[];
  timeline: string | null;
};

/** Validate the model's wada: strings trimmed, promise_at a real, future-ish
 *  ISO time (within 90 days of the call). Returns null when nothing useful. */
function cleanWada(raw: unknown, callTimeMs: number): Wada | null {
  if (!raw || typeof raw !== "object") return null;
  const w = raw as Record<string, unknown>;
  const str = (v: unknown) =>
    typeof v === "string" && v.trim() && v.trim().toLowerCase() !== "null" ? v.trim() : null;
  let promiseAt = str(w.promise_at);
  if (promiseAt) {
    const t = Date.parse(promiseAt);
    const max = callTimeMs + 90 * 24 * 3600 * 1000;
    if (isNaN(t) || t <= callTimeMs || t > max) promiseAt = null;
  }
  const objections = Array.isArray(w.objections)
    ? w.objections.filter((o): o is string => typeof o === "string" && !!o.trim()).slice(0, 3)
    : [];
  const out: Wada = {
    promise_at: promiseAt,
    promise_note: str(w.promise_note),
    budget: str(w.budget),
    preferences: str(w.preferences),
    objections,
    timeline: str(w.timeline),
  };
  const hasAnything = out.promise_at || out.budget || out.preferences || out.timeline || objections.length > 0;
  return hasAnything ? out : null;
}

/** Transcribe + summarize the given audio bytes and store both on the row. */
// Audio containers Groq's Whisper endpoint can decode. Anything else (e.g. the
// .amr many budget-phone recorders produce) can't be transcribed — we skip it
// gracefully instead of marking the call's summary "failed".
const WHISPER_OK = new Set(["flac", "mp3", "mp4", "mpeg", "mpga", "m4a", "ogg", "wav", "webm"]);

export async function summarizeAndStore(
  admin: SupabaseClient,
  callId: string,
  bytes: Uint8Array,
  source: string,
  extHint?: string,
): Promise<{ ok: boolean; summary?: string; disposition?: string; error?: string }> {
  if (!GROQ) return { ok: false, error: "GROQ_API_KEY is not configured." };
  // Skip transcription for formats Whisper can't read — the recording still
  // uploads and plays; only the AI summary is unavailable for it.
  const hintExt = (extHint ?? "").toLowerCase();
  if (hintExt && !WHISPER_OK.has(hintExt)) {
    await admin.from("call_logs").update({ summary_status: "unsupported" }).eq("id", callId);
    return { ok: false, error: `audio format .${hintExt} not supported for transcription` };
  }
  await admin.from("call_logs").update({ summary_status: "processing" }).eq("id", callId);
  // The call's own timestamp anchors relative promises ("Saturday ko call
  // karunga") to real datetimes.
  const { data: callRow } = await admin.from("call_logs")
    .select("started_at, created_at").eq("id", callId).maybeSingle();
  const callTimeMs = Date.parse(callRow?.started_at ?? callRow?.created_at ?? "") || Date.now();
  const callTimeIst = new Date(callTimeMs + 5.5 * 3600 * 1000).toISOString().replace("Z", "+05:30");
  try {
    // Whisper picks the decoder from the filename extension, so name the upload
    // to match the source's real container.
    const FMT: Record<string, [string, string]> = {
      sim: ["m4a", "audio/mp4"],
      callerdesk: ["wav", "audio/wav"], // CallerDesk recordings are .wav
    };
    const MIME: Record<string, string> = {
      m4a: "audio/mp4", mp4: "audio/mp4", mp3: "audio/mpeg", mpeg: "audio/mpeg",
      wav: "audio/wav", ogg: "audio/ogg", flac: "audio/flac", webm: "audio/webm",
    };
    // Prefer the sniffed extension (real container) over the source guess.
    const [ext, mime] = hintExt
      ? [hintExt, MIME[hintExt] ?? "audio/mpeg"]
      : (FMT[source] ?? ["wav", "audio/wav"]);

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
          {
            role: "user",
            content: `The call took place at: ${callTimeIst} (IST, India). ` +
              `Today's weekday and date should be derived from that timestamp.\n\n` +
              `Call transcript:\n\n${transcript.slice(0, 12000)}`,
          },
        ],
      }),
    });
    const chj = await ch.json();
    const raw: string = chj.choices?.[0]?.message?.content ?? "";
    if (!raw.trim()) throw new Error(`summary empty: ${JSON.stringify(chj).slice(0, 200)}`);

    // Parse the JSON reply; fall back to treating the whole reply as the summary.
    let summary = raw.trim();
    let disposition: string | null = null;
    let wada: Wada | null = null;
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed.summary === "string" && parsed.summary.trim()) summary = parsed.summary.trim();
      if (typeof parsed.disposition === "string" && DISPOSITIONS.includes(parsed.disposition)) {
        disposition = parsed.disposition;
      }
      wada = cleanWada(parsed.wada, callTimeMs);
    } catch { /* keep raw as summary, no disposition */ }

    // AUTO-APPLY the wada: the promise becomes a real follow-up and the heard
    // facts land on the lead — no taps. Falls back to 'pending' (the app shows
    // a confirm card) only when the call isn't linked to a contact.
    let wadaState: string | null = null;
    if (wada) {
      wadaState = "pending";
      try {
        const { data: call } = await admin.from("call_logs")
          .select("company_id, salesperson_id, contact_id, phone").eq("id", callId).maybeSingle();
        if (call?.contact_id) {
          const { data: contact } = await admin.from("contacts")
            .select("id, name, phone, budget, notes").eq("id", call.contact_id).maybeSingle();
          if (contact) {
            // Budget: fill-only-if-empty, enforced IN the update itself so a
            // budget the voice-note AI (or the rep) wrote a moment ago can
            // never be clobbered by this slower background task.
            if (wada.budget) {
              await admin.from("contacts").update({ budget: wada.budget })
                .eq("id", contact.id).is("budget", null);
            }
            const factLine = [
              wada.preferences ? `Chahiye: ${wada.preferences}` : null,
              wada.objections.length ? `Atka: ${wada.objections.join(", ")}` : null,
              wada.timeline ? `Kab tak: ${wada.timeline}` : null,
            ].filter(Boolean).join(" · ");
            if (factLine) {
              // Atomic + dedup-safe append (migration 0078) — concurrent writers
              // can't drop each other's lines any more.
              await admin.rpc("append_contact_note", { p_contact: contact.id, p_line: `🤖 ${factLine}` });
            }
            if (wada.promise_at) {
              // One lead = one pending follow-up. Move the existing one rather
              // than stacking a second — UNLESS it was set OR MOVED after this
              // call started (the rep, the post-call sheet or the voice-note AI
              // owns the newer plan; a moved follow-up keeps its old created_at,
              // so the LAST TOUCH — updated_at — is what decides).
              const note = wada.promise_note ?? "Wada — call pe promise kiya tha";
              const { data: existing } = await admin.from("follow_ups")
                .select("id, created_at, updated_at").eq("contact_id", contact.id).eq("status", "pending")
                .order("created_at", { ascending: false }).limit(1).maybeSingle();
              if (existing?.id) {
                const lastTouch = Math.max(
                  Date.parse(existing.updated_at ?? "") || 0,
                  Date.parse(existing.created_at ?? "") || 0,
                );
                if (lastTouch <= callTimeMs) {
                  await admin.from("follow_ups").update({ due_at: wada.promise_at, note }).eq("id", existing.id);
                }
              } else {
                await admin.from("follow_ups").insert({
                  company_id: call.company_id, salesperson_id: call.salesperson_id,
                  contact_id: contact.id, phone: contact.phone, name: contact.name,
                  due_at: wada.promise_at, note, status: "pending",
                });
              }
            }
            wadaState = "applied";
          }
        }
      } catch (e) {
        console.error(`wada auto-apply failed for ${callId}: ${e}`);
      }
    }

    await admin.from("call_logs")
      .update({
        transcript, summary, suggested_disposition: disposition, summary_status: "ready",
        ai_actions: wada, wada_state: wadaState,
      })
      .eq("id", callId);
    return { ok: true, summary, disposition: disposition ?? undefined };
  } catch (e) {
    await admin.from("call_logs").update({ summary_status: "failed" }).eq("id", callId);
    return { ok: false, error: String(e) };
  }
}
