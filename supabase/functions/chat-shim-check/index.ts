// Health check for the model chain in ../_shared/chat.ts.
//
// Kept because the question it answers comes up exactly when something is
// wrong and nobody wants to guess: how many keys are configured per provider,
// and does each one actually work?
//
//   POST {}                            → what is configured
//   POST {"probe":true}                → normal chain, names who answered
//   POST {"probe":true,"only":"gemini"} → test ONE provider on its own
//
// That last form matters: while Groq is healthy a plain probe always says
// "groq", which proves nothing about the fallbacks. Each link has to be
// testable alone or you only find out it was broken on the day you need it.
//
// Costs nothing unless probed, and JWT-gated so it is not an open endpoint.
import { chatJson, keyCounts, type Provider } from "../_shared/chat.ts";

Deno.serve(async (req) => {
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const probe = body.probe === true;
  const only = body.only as Provider | undefined;

  if (!probe) {
    return new Response(JSON.stringify({ ok: true, keys: keyCounts() }), {
      headers: { "Content-Type": "application/json" },
    });
  }
  try {
    const r = await chatJson('Reply ONLY as JSON {"hi": string}.', "say hi", { temperature: 0, only });
    return new Response(
      JSON.stringify({ ok: true, provider: r.provider, keys: keyCounts(), text: r.text.slice(0, 120) }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, keys: keyCounts(), error: String(e).slice(0, 500) }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
