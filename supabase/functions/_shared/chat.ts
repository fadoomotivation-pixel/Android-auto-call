// One place to ask a model for JSON, with a second provider behind the first.
//
// Seventeen edge functions share a SINGLE free Groq quota — 100,000 tokens a
// day across voice notes, call coaching, the nightly manager digest, win
// harvesting, x-ray, pulse, focus-five and the rest. With six companies and
// five active reps it is spent by lunchtime, and everything after that fails.
// The reps see it as "AI summary failed"; the manager sees a digest that never
// arrived. Growing the customer base without changing this makes it worse every
// week.
//
// The fix here is resilience, not a migration: Groq stays the primary, and when
// it refuses — quota gone, rate limited, timing out — the same request goes to
// Gemini, which has its own separate free allowance. Two independent daily
// budgets, and no single provider can take the platform down.
//
// If GEMINI_API_KEY is not set, behaviour is exactly as before: Groq only. So
// this is safe to ship before the key exists, and starts protecting the
// platform the moment it is added — no redeploy needed.
//
// Model names are read from env with sane defaults because provider model
// names change more often than this code should.

const GROQ = Deno.env.get("GROQ_API_KEY") ?? "";
const GEMINI = Deno.env.get("GEMINI_API_KEY") ?? "";
const GROQ_MODEL = Deno.env.get("GROQ_MODEL") ?? "llama-3.3-70b-versatile";
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-2.0-flash";

export const hasGemini = () => !!GEMINI;

/** True for the failures worth retrying on the other provider. */
function worthFailingOver(status: number, body: string): boolean {
  if (status === 429 || status >= 500) return true;
  const b = body.toLowerCase();
  return b.includes("rate limit") || b.includes("quota") || b.includes("tokens per day");
}

async function askGroq(system: string, user: string, temperature: number) {
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${GROQ}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  const raw = await r.text();
  let text = "";
  try { text = JSON.parse(raw)?.choices?.[0]?.message?.content ?? ""; } catch { /* keep raw for the error */ }
  return { ok: r.ok && !!text.trim(), status: r.status, text, raw };
}

async function askGemini(system: string, user: string, temperature: number) {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { temperature, responseMimeType: "application/json" },
    }),
  });
  const raw = await r.text();
  let text = "";
  try {
    const j = JSON.parse(raw);
    text = (j?.candidates?.[0]?.content?.parts ?? [])
      .map((p: { text?: string }) => p?.text ?? "").join("").trim();
  } catch { /* keep raw for the error */ }
  return { ok: r.ok && !!text.trim(), status: r.status, text, raw };
}

/**
 * Ask for a JSON reply. Returns the raw JSON string the model produced.
 * Throws with BOTH providers' errors when neither could answer, so whatever
 * stores the failure records something a human can act on.
 */
export async function chatJson(
  system: string,
  user: string,
  opts: { temperature?: number } = {},
): Promise<{ text: string; provider: string }> {
  const temperature = opts.temperature ?? 0.2;
  if (!GROQ && !GEMINI) throw new Error("No model key configured (GROQ_API_KEY / GEMINI_API_KEY).");

  let firstError = "";
  if (GROQ) {
    const g = await askGroq(system, user, temperature).catch((e) => ({
      ok: false as const, status: 0, text: "", raw: String(e),
    }));
    if (g.ok) return { text: g.text, provider: "groq" };
    firstError = `groq ${g.status}: ${g.raw.slice(0, 300)}`;
    // An empty-but-200 answer is a model hiccup, not a quota wall — still worth
    // the second provider, so only STOP here if there is nowhere else to go.
    if (!GEMINI) throw new Error(firstError);
    if (g.status !== 200 && !worthFailingOver(g.status, g.raw)) throw new Error(firstError);
  }

  const m = await askGemini(system, user, temperature).catch((e) => ({
    ok: false as const, status: 0, text: "", raw: String(e),
  }));
  if (m.ok) return { text: m.text, provider: "gemini" };
  throw new Error(`${firstError}${firstError ? " | " : ""}gemini ${m.status}: ${m.raw.slice(0, 300)}`);
}
