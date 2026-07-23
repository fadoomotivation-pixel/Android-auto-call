// The floating AI Coach in the app — one endpoint, one panel.
//
// POST {} (rep JWT) → {
//   coaching: { good, improve, callAt, leadName } | null   — the rep's LAST
//     real call (>= 30s, transcript ready). Generated ONCE per call and cached
//     in coach_feedback: short calls are fake/no-signal (plot bechne wali call
//     lambi hoti hai) and re-coaching every open would frustrate the rep.
//   brief: { slot, content } | null — after 10 AM IST: "kal ka din kaisa tha";
//     after 6 PM IST: "aaj kya acha raha". Cached per rep/date/slot.
// }
//
// Linked, not duplicated: it reads the SAME call_logs transcripts and
// lead_voice_notes that team-pulse / sales-xray read, and WRITES its coaching
// into shared tables those features (and manager-digest) can join on. The
// accumulated coach_feedback rows are the growing corpus that trains Call Pro
// AI's coaching for every company automatically.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GROQ = Deno.env.get("GROQ_API_KEY") ?? "";

const MIN_COACH_SECONDS = 30;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

function istNow(): Date {
  return new Date(Date.now() + 5.5 * 3600 * 1000);
}
function istDate(offsetDays = 0): string {
  return new Date(Date.now() + 5.5 * 3600 * 1000 + offsetDays * 86400_000).toISOString().slice(0, 10);
}
function istDayStartIso(offsetDays = 0): string {
  return new Date(`${istDate(offsetDays)}T00:00:00+05:30`).toISOString();
}

async function groqJson(system: string, user: string, temperature = 0.4): Promise<Record<string, unknown> | null> {
  if (!GROQ) return null;
  try {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${GROQ}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile", temperature, response_format: { type: "json_object" },
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
      }),
    });
    const raw = (await r.json()).choices?.[0]?.message?.content ?? "";
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const auth = req.headers.get("Authorization") ?? "";
  const u = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
  const { data: ud } = await u.auth.getUser();
  if (!ud?.user) return json({ ok: false, error: "Unauthorized" }, 401);
  const uid = ud.user.id;

  const admin = createClient(SUPABASE_URL, SERVICE);
  const { data: prof } = await admin.from("profiles").select("company_id, full_name").eq("id", uid).maybeSingle();
  if (!prof?.company_id) return json({ ok: false, error: "No company" }, 400);
  const company = prof.company_id as string;

  // ---------- 1) Last-call coaching (cached per call) ----------
  let coaching: Record<string, unknown> | null = null;
  const { data: lastCall } = await admin.from("call_logs")
    .select("id, contact_id, started_at, duration_seconds, transcript, summary")
    .eq("salesperson_id", uid)
    .gte("duration_seconds", MIN_COACH_SECONDS)
    .not("transcript", "is", null)
    .order("started_at", { ascending: false, nullsFirst: false })
    .limit(1).maybeSingle();

  if (lastCall?.id) {
    const { data: cached } = await admin.from("coach_feedback")
      .select("good, improve").eq("call_id", lastCall.id).maybeSingle();
    let good = cached?.good as string | undefined;
    let improve = cached?.improve as string | undefined;

    if (!cached) {
      const out = await groqJson(
        "You are a warm, senior real-estate sales coach reviewing ONE call by a telecaller. " +
        "The transcript may be Hindi/English/Hinglish. Reply ONLY as JSON " +
        '{"good": string, "improve": string}. Each 1-2 short sentences in encouraging ' +
        "Hinglish (aap-form). good = what the rep genuinely did well on THIS call. " +
        "improve = the ONE most useful thing to do better next time (not a list — " +
        "over-coaching frustrates reps). Be specific to the transcript, never generic. NEVER invent details.",
        `Call transcript:\n\n${String(lastCall.transcript).slice(0, 9000)}`,
      );
      if (out?.good || out?.improve) {
        good = typeof out.good === "string" ? out.good : undefined;
        improve = typeof out.improve === "string" ? out.improve : undefined;
        await admin.from("coach_feedback").upsert({
          call_id: lastCall.id, salesperson_id: uid, company_id: company,
          good: good ?? null, improve: improve ?? null,
        });
      }
    }

    if (good || improve) {
      let leadName: string | null = null;
      if (lastCall.contact_id) {
        const { data: c } = await admin.from("contacts").select("name").eq("id", lastCall.contact_id).maybeSingle();
        leadName = (c?.name as string) ?? null;
      }
      coaching = { good: good ?? null, improve: improve ?? null, callAt: lastCall.started_at, leadName };
    }
  }

  // ---------- 2) Time-aware brief (10 AM → yesterday, 6 PM → today) ----------
  let brief: Record<string, unknown> | null = null;
  const hour = istNow().getUTCHours(); // istNow is shifted, so getUTCHours IS the IST hour
  const slot = hour >= 18 ? "evening" : hour >= 10 ? "morning" : null;

  if (slot) {
    const briefDate = istDate();
    const { data: cachedBrief } = await admin.from("coach_briefs")
      .select("content").eq("salesperson_id", uid).eq("brief_date", briefDate).eq("slot", slot).maybeSingle();

    if (cachedBrief?.content) {
      brief = { slot, content: cachedBrief.content };
    } else {
      // Morning reviews YESTERDAY; evening reviews TODAY. Same raw data the
      // pulse/x-ray pipelines read — no separate bookkeeping.
      const from = slot === "morning" ? istDayStartIso(-1) : istDayStartIso(0);
      const to = slot === "morning" ? istDayStartIso(0) : new Date().toISOString();

      const [{ data: calls }, { data: notes }] = await Promise.all([
        admin.from("call_logs")
          .select("duration_seconds, outcome, summary")
          .eq("salesperson_id", uid).gte("started_at", from).lt("started_at", to)
          .order("started_at").limit(120),
        admin.from("lead_voice_notes")
          .select("summary").eq("salesperson_id", uid)
          .gte("created_at", from).lt("created_at", to).limit(40),
      ]);

      const total = calls?.length ?? 0;
      const connected = (calls ?? []).filter((c) => (c.duration_seconds ?? 0) >= MIN_COACH_SECONDS).length;
      const talkMin = Math.round((calls ?? []).reduce((s, c) => s + (c.duration_seconds ?? 0), 0) / 60);
      const callSummaries = (calls ?? []).map((c) => c.summary).filter(Boolean).slice(0, 12);
      const noteSummaries = (notes ?? []).map((n) => n.summary).filter(Boolean).slice(0, 12);

      if (total === 0 && noteSummaries.length === 0) {
        brief = {
          slot,
          content: slot === "morning"
            ? "Kal koi call log nahi hui. Aaj fresh shuruaat karte hain — pehle 2 ghante me 10 calls ka target rakhiye! 💪"
            : "Aaj abhi tak koi call log nahi hui. Din khatam hone se pehle kuch follow-ups nipta lijiye! 📞",
        };
      } else {
        const label = slot === "morning" ? "KAL (yesterday)" : "AAJ (today, so far)";
        const out = await groqJson(
          "You are a supportive real-estate sales coach writing a mini day-review for a telecaller. " +
          'Reply ONLY as JSON {"content": string}. content = 3-4 short lines in warm Hinglish (aap-form): ' +
          "(1) ek line me din ka scorecard, (2) sabse important baat / best moment from the summaries, " +
          "(3) ek concrete focus for next. Max ~70 words, emojis welcome, never scolding, never generic. NEVER invent details.",
          `${label} for ${prof.full_name ?? "the rep"}:\n` +
          `Calls: ${total}, real conversations (>=30s): ${connected}, talk time: ${talkMin} min.\n` +
          `Call summaries:\n${callSummaries.map((s) => `- ${s}`).join("\n") || "(none)"}\n` +
          `Voice-note summaries:\n${noteSummaries.map((s) => `- ${s}`).join("\n") || "(none)"}`,
          0.5,
        );
        const content = typeof out?.content === "string" && out.content.trim() ? out.content.trim() : null;
        if (content) {
          await admin.from("coach_briefs").upsert({
            salesperson_id: uid, brief_date: briefDate, slot, company_id: company, content,
          });
          brief = { slot, content };
        }
      }
    }
  }

  return json({ ok: true, coaching, brief });
});
