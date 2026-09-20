// One place that knows how to talk to Groq, because twenty-one places did not.
//
// On 20 Sep 2026 every AI feature in this product was dead and nobody knew.
// `llama-3.3-70b-versatile` had been retired on this account; all twenty-one
// call sites caught the 404, returned null, and said nothing. coach_briefs
// stopped writing on 12 September. Silence and success look identical from
// outside a try/catch, and that is how a fortnight went by.
//
// So: one module. It walks a chain, tells "this model is gone" apart from
// "Groq is busy", remembers the one that answered, and — the part that
// actually matters — RETURNS THE REASON when it cannot help, so the caller can
// put it in its own response instead of pretending everything is fine.
//
// GROQ_MODEL (comma-separated) wins over the built-in chain, so the day these
// names go too, the fix is an environment variable and no deploy at all.

const GROQ = Deno.env.get("GROQ_API_KEY") ?? "";

/** Verified live on this account on 20 Sep 2026 by asking the API itself
 *  (`GET /v1/models`), in preference order — not copied from a blog post. */
export const MODEL_CHAIN: string[] = [
  ...(Deno.env.get("GROQ_MODEL") ?? "").split(",").map((m) => m.trim()).filter(Boolean),
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "qwen/qwen3.8-27b",
];

let liveModel: string | null = null;

/** Which model answered last, for a caller that wants to report it. */
export const currentModel = () => liveModel;

export type GroqResult<T> = { data: T | null; error: string | null; model: string | null };

async function askOnce(
  model: string,
  system: string,
  user: string,
  temperature: number,
  jsonMode: boolean,
): Promise<{ text: string | null; error: string | null; gone: boolean }> {
  try {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${GROQ}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature,
        ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
      }),
    });
    const j = await r.json().catch(() => null) as Record<string, unknown> | null;
    if (!r.ok) {
      const e = String((j?.error as Record<string, unknown> | undefined)?.message ?? "");
      // A 404 means THIS model is gone, so try the next. A 429 or a 500 means
      // Groq is busy, and walking the chain would hammer them with the same
      // request under four different names.
      const gone = r.status === 404 || /does not exist|decommissioned|not found/i.test(e);
      return { text: null, error: `groq ${r.status} on ${model}: ${e.slice(0, 140)}`, gone };
    }
    const raw = (j as { choices?: { message?: { content?: string } }[] })
      ?.choices?.[0]?.message?.content ?? "";
    if (!raw.trim()) return { text: null, error: `empty message from ${model}`, gone: false };
    return { text: raw, error: null, gone: false };
  } catch (e) {
    return { text: null, error: String(e).slice(0, 160), gone: false };
  }
}

/** Ask Groq for text. Never throws; the reason always comes back. */
export async function groqText(
  system: string,
  user: string,
  temperature = 0.4,
  jsonMode = false,
): Promise<GroqResult<string>> {
  if (!GROQ) return { data: null, error: "no GROQ_API_KEY", model: null };

  if (liveModel) {
    const r = await askOnce(liveModel, system, user, temperature, jsonMode);
    if (!r.gone) return { data: r.text, error: r.error, model: liveModel };
    liveModel = null; // retired mid-run; fall through and find another
  }

  let last: string | null = null;
  for (const model of MODEL_CHAIN) {
    const r = await askOnce(model, system, user, temperature, jsonMode);
    if (!r.gone) {
      if (!r.error) liveModel = model;
      return { data: r.text, error: r.error, model };
    }
    last = r.error;
  }
  return { data: null, error: `no usable Groq model. Last: ${last ?? "unknown"}`, model: null };
}

/** Ask Groq for JSON. Same guarantees; a reply that will not parse is an
 *  error with the text attached, never a silent null. */
export async function groqJson<T = Record<string, unknown>>(
  system: string,
  user: string,
  temperature = 0.2,
): Promise<GroqResult<T>> {
  const r = await groqText(system, user, temperature, true);
  if (!r.data) return { data: null, error: r.error, model: r.model };
  try {
    return { data: JSON.parse(r.data) as T, error: null, model: r.model };
  } catch {
    return { data: null, error: `unparseable JSON: ${r.data.slice(0, 120)}`, model: r.model };
  }
}

/** What this account can actually use, straight from Groq. One call. Had this
 *  been reachable on 12 September, the outage above would have been a
 *  thirty-second diagnosis. */
export async function listModels(): Promise<{ ok: boolean; status: number; models: string[] }> {
  const r = await fetch("https://api.groq.com/openai/v1/models", {
    headers: { Authorization: `Bearer ${GROQ}` },
  });
  const j = await r.json().catch(() => null) as { data?: { id?: string }[] } | null;
  return {
    ok: r.ok,
    status: r.status,
    models: (j?.data ?? []).map((m) => m.id).filter((x): x is string => !!x).sort(),
  };
}
