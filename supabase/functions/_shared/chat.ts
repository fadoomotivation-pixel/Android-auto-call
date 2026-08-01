// One place to ask a model for JSON, with three providers behind each other
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
// The fix is resilience, not a migration. The chain, in order:
//
//   1. Groq      — llama-3.3-70b-versatile, what everything already used
//   2. Cerebras  — separate allowance, OpenAI-compatible API
//   3. Gemini    — a different model family again, the last line
//
// Both fallbacks were verified against the real keys rather than assumed, and
// both defaults had to be corrected as a result:
//   • Cerebras does NOT serve llama on this account. Its list is gpt-oss-120b,
//     zai-glm-4.7 and gemma-4-31b — and at the time of writing ALL of them
//     answer 402 "payment required", so this link is dormant until that account
//     is on a paid plan. The code path costs nothing while it sits idle.
//   • Gemini rejected gemini-2.0-flash (429) and gemini-2.5-flash /
//     gemini-2.5-flash-lite (404) on this key. gemini-flash-latest answers, so
//     that is the default — the full flash rather than the lite one, since it
//     is the closer match to the llama 70b it stands in for.
//
// This is exactly why model names are env-overridable and why chat-shim-check
// can list and fire at them: a default that has quietly gone stale looks
// identical to a dead key from a single failed call.
//
// Any key may hold SEVERAL keys separated by commas; each carries its own daily
// allowance. Note that stacking free accounts to raise a quota is against most
// providers' terms and keys can be suspended for it — that is a business call,
// not a technical one, and the code takes no view. A paid tier is the durable
// version.
//
// Every provider is optional. With only GROQ_API_KEY set the behaviour is
// exactly what it always was, so keys can be added one at a time and take
// effect immediately with no redeploy.

/** "a, b ,c" → ["a","b","c"], reading the first env name that has anything. */
function keys(...names: string[]): string[] {
  for (const n of names) {
    const list = (Deno.env.get(n) ?? "")
      .split(/[,\s]+/)
      .map((k) => k.trim())
      .filter(Boolean);
    if (list.length) return list;
  }
  return [];
}

const GROQ_KEYS = keys("GROQ_API_KEY");
// Accepts the lowercase `cerebras` name too, because that is what the secret
// was actually created as — a silently ignored key is worse than a tolerant read.
const CEREBRAS_KEYS = keys("CEREBRAS_API_KEY", "cerebras", "CEREBRAS");
const GEMINI_KEYS = keys("GEMINI_API_KEY");

const GROQ_MODEL = Deno.env.get("GROQ_MODEL") ?? "llama-3.3-70b-versatile";
const CEREBRAS_MODEL = Deno.env.get("CEREBRAS_MODEL") ?? "gpt-oss-120b";
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-flash-latest";

export const hasGemini = () => GEMINI_KEYS.length > 0;
export const keyCounts = () => ({
  groq: GROQ_KEYS.length,
  cerebras: CEREBRAS_KEYS.length,
  gemini: GEMINI_KEYS.length,
});

/** True for the failures worth trying another key or provider on. */
function worthFailingOver(status: number, body: string): boolean {
  if (status === 429 || status >= 500) return true;
  const b = body.toLowerCase();
  return b.includes("rate limit") || b.includes("quota") || b.includes("tokens per day") ||
    b.includes("resource_exhausted") || b.includes("exhausted");
}

interface Attempt { ok: boolean; status: number; text: string; raw: string }

/** Groq and Cerebras both speak the OpenAI chat-completions dialect. */
function openAiCompatible(url: string, model: string) {
  return async (key: string, system: string, user: string, temperature: number): Promise<Attempt> => {
    const r = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
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
  };
}

const askGroq = openAiCompatible("https://api.groq.com/openai/v1/chat/completions", GROQ_MODEL);
const askCerebras = openAiCompatible("https://api.cerebras.ai/v1/chat/completions", CEREBRAS_MODEL);

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

export type Provider = "groq" | "cerebras" | "gemini";

/**
 * Ask for a JSON reply. Returns the raw JSON string the model produced.
 *
 * `only` restricts the attempt to one provider — used by the health check to
 * prove each link of the chain works on its own, which a plain call can never
 * show while the first provider is still healthy.
 *
 * Throws with every provider/key error when none could answer, so whatever
 * stores the failure records something a human can act on.
 */
export async function chatJson(
  system: string,
  user: string,
  opts: { temperature?: number; only?: Provider } = {},
): Promise<{ text: string; provider: Provider }> {
  const temperature = opts.temperature ?? 0.2;
  const chain: Array<[Provider, string[], typeof askGemini]> = [
    ["groq", GROQ_KEYS, askGroq],
    ["cerebras", CEREBRAS_KEYS, askCerebras],
    ["gemini", GEMINI_KEYS, askGemini],
  ];
  const use = opts.only ? chain.filter(([name]) => name === opts.only) : chain;

  if (use.every(([, ks]) => ks.length === 0)) {
    throw new Error(`No key configured for ${opts.only ?? "any provider"}.`);
  }

  const errors: string[] = [];
  for (const [name, ks, ask] of use) {
    const r = await tryKeys(ks, ask, name, system, user, temperature);
    if (r.hit) return { text: r.hit.text, provider: name };
    errors.push(...r.errors);
  }
  throw new Error(errors.join(" | ") || "no provider answered");
}
