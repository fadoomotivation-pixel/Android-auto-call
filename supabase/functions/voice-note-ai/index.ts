// The AI twist on lead voice notes — now an assistant that ACTS:
// 1. Transcribes the telecaller's spoken note (Groq Whisper — Hindi/Hinglish OK)
// 2. Summarizes + suggests the lead's stage (Groq Llama)
// 3. AUTO-ACTIONS from what was said:
//    • "27 tarik ko site visit" → lead moves to Site Visit with that date, and
//      the rep gets reminders: day-before 10:00 IST ("Tomorrow is X's site
//      visit") + visit morning 08:30 IST ("Today is X's site visit")
//    • "parso 5 baje call karna" → a follow-up is scheduled + push at that time
//    • budget / hot-warm-cold mentioned → filled on the lead
//    Every action lands in the lead's Journey timeline as "AI Assistant".
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

// India timezone helpers (the telecaller market runs on IST).
const IST_OFFSET_MS = 5.5 * 3600 * 1000;
function istToday(): { date: string; weekday: string } {
  const now = new Date(Date.now() + IST_OFFSET_MS);
  const date = now.toISOString().slice(0, 10);
  const weekday = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][now.getUTCDay()];
  return { date, weekday };
}
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
function istIso(date: string, time: string): string {
  return `${date}T${time}:00+05:30`;
}
function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function prettyIst(date: string, time?: string | null): string {
  const [y, m, d] = date.split("-").map(Number);
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  let s = `${d} ${MON[(m ?? 1) - 1]}`;
  if (time) {
    const [hh, mm] = time.split(":").map(Number);
    const h12 = ((hh + 11) % 12) + 1;
    s += `, ${h12}:${String(mm).padStart(2, "0")} ${hh < 12 ? "AM" : "PM"}`;
  }
  void y;
  return s;
}

function systemPrompt(): string {
  const { date, weekday } = istToday();
  return (
    "A real-estate telecaller has recorded a voice note, in their own words, " +
    "about how a call with a lead went. It may be Hindi, English or Hinglish. " +
    `Today is ${weekday}, ${date} (India). ` +
    'Reply ONLY with JSON: {"summary": string, "disposition": string, ' +
    '"site_visit_date": string|null, "site_visit_time": string|null, ' +
    '"callback_date": string|null, "callback_time": string|null, ' +
    '"budget": string|null, "temperature": string|null}. ' +
    "summary: clear English, max ~80 words — outcome, the customer's intent/" +
    "objections, and the telecaller's next action. " +
    "disposition: the lead's stage per this note, exactly one of " +
    `[${DISPOSITIONS.map((d) => `"${d}"`).join(", ")}] or "unknown". ` +
    "site_visit_date: ONLY if a site visit was agreed/planned, resolve phrases " +
    'like "27 tarik", "agle Sunday", "parso" to YYYY-MM-DD (future). ' +
    "site_visit_time: HH:MM 24h if a time was said, else null. " +
    "callback_date/callback_time: ONLY if the lead asked to be called back at " +
    "a specific day/time. budget: as spoken (e.g. \"45L\", \"1.2 Cr\") or null. " +
    'temperature: "hot"|"warm"|"cold" only if the interest level is clear, else null.'
  );
}

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
    .select("id, contact_id, company_id, actor_id, audio_path, summary, ai_status").eq("id", note_id).maybeSingle();
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
        model: "llama-3.3-70b-versatile", temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt() },
          { role: "user", content: `Voice note transcript:\n\n${transcript.slice(0, 12000)}` },
        ],
      }),
    });
    const chj = await ch.json();
    const raw: string = chj.choices?.[0]?.message?.content ?? "";
    if (!raw.trim()) throw new Error(`summary empty: ${JSON.stringify(chj).slice(0, 200)}`);

    let summary = raw.trim();
    let disposition: string | null = null;
    let svDate: string | null = null, svTime: string | null = null;
    let cbDate: string | null = null, cbTime: string | null = null;
    let budget: string | null = null, temp: string | null = null;
    try {
      const p = JSON.parse(raw);
      if (typeof p.summary === "string" && p.summary.trim()) summary = p.summary.trim();
      if (typeof p.disposition === "string" && DISPOSITIONS.includes(p.disposition)) disposition = p.disposition;
      if (typeof p.site_visit_date === "string" && DATE_RE.test(p.site_visit_date)) svDate = p.site_visit_date;
      if (typeof p.site_visit_time === "string" && TIME_RE.test(p.site_visit_time)) svTime = p.site_visit_time;
      if (typeof p.callback_date === "string" && DATE_RE.test(p.callback_date)) cbDate = p.callback_date;
      if (typeof p.callback_time === "string" && TIME_RE.test(p.callback_time)) cbTime = p.callback_time;
      if (typeof p.budget === "string" && p.budget.trim()) budget = p.budget.trim().slice(0, 40);
      if (typeof p.temperature === "string" && ["hot", "warm", "cold"].includes(p.temperature)) temp = p.temperature;
    } catch { /* keep raw as summary */ }

    // ---------- AUTO-ACTIONS ----------
    const actions: string[] = [];
    const { data: contact } = await admin.from("contacts")
      .select("id, name, phone, salesperson_id, company_id, status, budget, temperature")
      .eq("id", note.contact_id).maybeSingle();
    const rep: string | null = contact?.salesperson_id ?? note.actor_id ?? null;
    const who = contact?.name ?? contact?.phone ?? "lead";
    const today = istToday().date;

    async function logAct(type: string, detail: string) {
      await admin.from("lead_activities").insert({
        company_id: note.company_id, contact_id: note.contact_id,
        actor_id: note.actor_id, actor_name: "AI Assistant 🤖", type, detail,
      });
    }
    async function remind(sendAtIso: string, title: string, body: string) {
      if (!rep) return;
      if (new Date(sendAtIso).getTime() <= Date.now()) return; // never schedule the past
      await admin.from("scheduled_notifications").insert({
        company_id: note.company_id, user_id: rep, contact_id: note.contact_id,
        title, body, channel: "hot_leads", send_at: sendAtIso,
      });
    }

    // Site visit agreed → set the stage + date, and arm both reminders.
    if (contact && svDate && svDate >= today) {
      const visitAt = istIso(svDate, svTime ?? "11:00");
      await admin.from("contacts").update({
        status: "site_visit", site_visit_at: visitAt,
      }).eq("id", contact.id);
      const pretty = prettyIst(svDate, svTime ?? "11:00");
      actions.push(`Site visit set for ${pretty}`);
      await logAct("site_visit", `Site visit set for ${pretty} (from voice note)`);
      await remind(istIso(addDays(svDate, -1), "10:00"), "🏠 Tomorrow: site visit",
        `Tomorrow is ${who}'s site visit (${pretty}). Confirm on WhatsApp & prep the documents.`);
      await remind(istIso(svDate, "08:30"), "🏠 Today: site visit",
        `Today is ${who}'s site visit (${pretty}). All the best!`);
      actions.push("Reminders scheduled (day before 10 AM + visit morning)");
    }

    // Lead asked for a callback at a time → follow-up + push at that moment.
    if (contact && cbDate && cbDate >= today && rep) {
      const dueAt = istIso(cbDate, cbTime ?? "10:00");
      if (new Date(dueAt).getTime() > Date.now()) {
        await admin.from("follow_ups").insert({
          company_id: note.company_id, salesperson_id: rep, contact_id: contact.id,
          phone: contact.phone, name: contact.name, due_at: dueAt,
          note: "AI: voice note se scheduled",
        });
        const pretty = prettyIst(cbDate, cbTime ?? "10:00");
        actions.push(`Callback scheduled for ${pretty}`);
        await logAct("follow_up", `Callback scheduled for ${pretty} (from voice note)`);
        await remind(dueAt, "↻ Callback time", `${who} asked to be called now (${pretty}). Dial from the app.`);
      }
    }

    // Budget / temperature spoken → fill the lead.
    if (contact && (budget || temp)) {
      const patch: Record<string, string> = {};
      if (budget && budget !== contact.budget) patch.budget = budget;
      if (temp && temp !== contact.temperature) patch.temperature = temp;
      if (Object.keys(patch).length) {
        await admin.from("contacts").update(patch).eq("id", contact.id);
        if (patch.budget) { actions.push(`Budget: ${patch.budget}`); await logAct("budget", `Budget: ${patch.budget} (from voice note)`); }
        if (patch.temperature) { actions.push(`Marked ${patch.temperature}`); await logAct("temperature", `Marked ${patch.temperature} (from voice note)`); }
      }
    }

    if (actions.length) summary = `${summary}\n⚡ AI did: ${actions.join(" · ")}`;

    await admin.from("lead_voice_notes")
      .update({ transcript, summary, suggested_disposition: disposition, ai_status: "ready" })
      .eq("id", note_id);
    return json({ ok: true, summary, disposition: disposition ?? undefined, actions });
  } catch (e) {
    await admin.from("lead_voice_notes").update({ ai_status: "failed" }).eq("id", note_id);
    return json({ ok: false, error: String(e) }, 500);
  }
});
