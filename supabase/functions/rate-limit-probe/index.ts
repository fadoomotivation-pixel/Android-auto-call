// What does each provider ACTUALLY allow?
//
// The question "which provider should carry the token-heavy work" only has a
// real answer if you know each one's limit and what shape it is. Groq's is a
// tokens-per-DAY cap, which a 1,145-token system prompt eats fast. Others meter
// by requests instead, where a big prompt costs proportionally far less.
//
// Rather than trust anyone's summary of the free tiers, this sends one tiny
// real request to each and reports the rate-limit headers they send back.
// Standalone on purpose: no shared imports, so it can be deployed and read
// without touching the live chain.
//
// What it found (1 Aug 2026), and why the chain is ordered the way it is:
//   groq    — 1000 req/min, 12k tokens/min, PLUS a 100k tokens/DAY cap
//   mistral — 4 req/min, 250k tokens/min, no daily token cap in the headers
// So the two cover each other's weakness: Mistral has the tokens, Groq has the
// request rate. Token-heavy work goes to Mistral first; a burst that trips its
// 4/min spills to Groq, which has rate to spare.
const PROVIDERS = [
  {
    name: "groq",
    keyNames: ["GROQ_API_KEY"],
    url: "https://api.groq.com/openai/v1/chat/completions",
    model: Deno.env.get("GROQ_MODEL") ?? "llama-3.3-70b-versatile",
  },
  {
    name: "mistral",
    keyNames: ["MISTRAL_API_KEY", "mistral", "MISTRAL"],
    url: "https://api.mistral.ai/v1/chat/completions",
    model: Deno.env.get("MISTRAL_MODEL") ?? "mistral-large-latest",
  },
];

function firstKey(names: string[]): string {
  for (const n of names) {
    const v = (Deno.env.get(n) ?? "").split(/[,\s]+/).filter(Boolean)[0];
    if (v) return v;
  }
  return "";
}

/** Only the headers that say something about limits. */
function limitHeaders(h: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of h.entries()) {
    const lk = k.toLowerCase();
    if (lk.includes("ratelimit") || lk.includes("rate-limit") || lk === "retry-after") {
      out[lk] = v;
    }
  }
  return out;
}

Deno.serve(async () => {
  const out: Record<string, unknown> = {};

  for (const p of PROVIDERS) {
    const key = firstKey(p.keyNames);
    if (!key) { out[p.name] = "no key"; continue; }
    try {
      const r = await fetch(p.url, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: p.model,
          temperature: 0,
          messages: [{ role: "user", content: "hi" }],
        }),
      });
      const body = await r.text();
      out[p.name] = {
        status: r.status,
        model: p.model,
        limits: limitHeaders(r.headers),
        note: r.ok ? undefined : body.slice(0, 140),
      };
    } catch (e) { out[p.name] = String(e).slice(0, 150); }
  }

  // Gemini publishes no rate-limit headers, so the only honest thing is to say
  // so rather than invent a number for it.
  out.gemini = "Google returns no rate-limit headers; its free tier meters by requests/day and tokens/minute, not a small daily token cap. Check ai.google.dev for the current figures.";

  return new Response(JSON.stringify(out, null, 1), {
    headers: { "Content-Type": "application/json" },
  });
});
