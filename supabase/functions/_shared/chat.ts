// One place to ask a model for JSON, with a second provider behind the first
// and support for several keys per provider.
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
// Gemini, which has its own separate free allowance.
//
// Either key may hold SEVERAL keys separated by commas. Each is a separate
// daily allowance, so three Gemini keys is three budgets. Note that stacking
// free accounts to raise a quota is against most providers' terms and the keys
// can be suspended for it — that is a business call, not a technical one, and
// the code takes no view. A paid tier on one key is the durable version.
//
// If GEMINI_API_KEY is not set, behaviour is exactly as before: Groq only. So
// this is safe to ship before the key exists, and starts protecting the
// platform the moment it is added — no redeploy needed.
//
// Model names are read from env with sane defaults because provider model
// names change more often than this code should.

/** "a, b ,c" → ["a","b","c"]. Blank-safe. */
function keys(name: string): string[] {
  return (Deno.env.get(name) ?? "")
    .split(/[,\s]+/)
    .map((k) => k.trim())
    .filter(Boolean);
}

const GROQ_KEYS = keys("GROQ_API_KEY");
const GEMINI_KEYS = keys("GEMINI_API_KEY");
const GROQ_MODEL = Deno.env.get("GROQ_MODEL") ?? "llama-3.3-70b-versatile";
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-2.0-flash";

export const hasGemini = () => GEMINI_KEYS.length > 0;
export const keyCounts = () => ({ groq: GROQ_KEYS.length, gemini: GEMINI_KEYS.length });

/** True for the failures worth trying another key or provider on. */
function worthFailingOver(status: number, body: string): boolean {
  if (status === 429 || status >= 500) return true;
  const b = body.toLowerCase();
  return b.includes("rate limit") || b.includes("quota") || b.includes("tokens per day") ||
    b.includes("resource_exhausted") || b.includes("exhausted");
}

interface Attempt { ok: boolean; status: number; text: string; raw: string }

async function askGroq(key: string, system: string, user: string, temperature: number): Promise<Attempt> {
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
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

async function askGemini(key: string, system: string, user: string, temperature: number): Promise<Attempt> {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;
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
 * Walk a provider's keys until one answers.
 *
 * The starting point rotates, so with several keys the load spreads instead of
 * hammering the first one until it dies and then paying a wasted 429 on it for
 * every request after that. A 429 costs no tokens, only time — but with three
 * exhausted keys that is three wasted round-trips on every call.
 */
async function tryKeys(
  ks: string[],
  ask: (k: string, s: string, u: string, t: number) => Promise<Attempt>,
  label: string,
  system: string,
  user: string,
  temperature: number,
): Promise<{ hit?: Attempt; errors: string[] }> {
  const errors: string[] = [];
  if (ks.length === 0) return { errors };
  const start = Math.floor(Math.random() * ks.length);
  for (let i = 0; i < ks.length; i++) {
    const idx = (start + i) % ks.length;
    const a = await ask(ks[idx], system, user, temperature).catch((e) => ({
      ok: false, status: 0, text: "", raw: String(e),
    } as Attempt));
    if (a.ok) return { hit: a, errors };
    errors.push(`${label}#${idx + 1} ${a.status}: ${a.raw.slice(0, 200)}`);
    // A hard rejection (bad key, bad request) will fail the same way on every
    // other key, so don't burn the rest of the list on it.
    if (a.status !== 200 && !worthFailingOver(a.status, a.raw)) break;
  }
  return { errors };
}

/**
 * Ask for a JSON reply. Returns the raw JSON string the model produced.
 * Throws with every provider/key error when none could answer, so whatever
 * stores the failure records something a human can act on.
 */
export async function chatJson(
  system: string,
  user: string,
  opts: { temperature?: number } = {},
): Promise<{ text: string; provider: string }> {
  const temperature = opts.temperature ?? 0.2;
  if (GROQ_KEYS.length === 0 && GEMINI_KEYS.length === 0) {
    throw new Error("No model key configured (GROQ_API_KEY / GEMINI_API_KEY).");
  }

  const g = await tryKeys(GROQ_KEYS, askGroq, "groq", system, user, temperature);
  if (g.hit) return { text: g.hit.text, provider: "groq" };

  const m = await tryKeys(GEMINI_KEYS, askGemini, "gemini", system, user, temperature);
  if (m.hit) return { text: m.hit.text, provider: "gemini" };

  throw new Error([...g.errors, ...m.errors].join(" | ") || "no provider answered");
}
