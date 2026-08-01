// Health check for the model fallback in ../_shared/chat.ts.
//
// Kept because the question it answers comes up exactly when something is
// wrong and nobody wants to guess: how many keys are configured per provider,
// and which one is actually answering right now? POST {} to see what is
// configured; POST {"probe":true} to spend a few tokens on a real round-trip
// and have it name the provider that replied.
//
// Costs nothing unless probed, and JWT-gated so it is not an open endpoint.
import { chatJson, hasGemini, keyCounts } from "../_shared/chat.ts";

Deno.serve(async (req) => {
  const { probe } = await req.json().catch(() => ({ probe: false }));
  if (!probe) {
    return new Response(JSON.stringify({ ok: true, gemini: hasGemini(), keys: keyCounts() }), {
      headers: { "Content-Type": "application/json" },
    });
  }
  try {
    const r = await chatJson('Reply ONLY as JSON {"hi": string}.', "say hi", { temperature: 0 });
    return new Response(JSON.stringify({ ok: true, provider: r.provider, keys: keyCounts(), text: r.text.slice(0, 120) }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, keys: keyCounts(), error: String(e).slice(0, 500) }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
