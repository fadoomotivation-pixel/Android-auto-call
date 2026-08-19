// RAG v8 — the "glass box", now with a Claude Fable 5 brain. Ask the company's
// AI anything and get back not just an answer, but HOW it reasoned: the exact
// source facts it used (each scored), an honest confidence rating, AND — when
// powered by Fable — a readable summary of its own thinking. If it doesn't have
// the facts, it says so rather than bluffing. Company-isolated (match_knowledge
// verifies ownership + blends the shared global brain).
//
// Engine: Claude Fable 5 (claude-fable-5) when ANTHROPIC_API_KEY is set — with a
// server-side fallback to Opus 4.8 on a policy decline. Falls back to Groq
// (llama-3.3-70b) automatically when no Anthropic key is configured, so the
// feature never goes dark. Body: { question }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

declare const Supabase: { ai: { Session: new (m: string) => { run(input: string, opts: { mean_pool: boolean; normalize: boolean }): Promise<number[]> } } };

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
const GROQ = Deno.env.get("GROQ_API_KEY") ?? "";
const ANTHROPIC = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

type Src = { title: string | null; content: string; source_kind: string; similarity: number };
type Gen = { answer: string; reasoning: string; engine: "fable" | "groq"; model: string };

function buildSystem(sources: Src[]): string {
  return "You answer ONLY from the COMPANY KNOWLEDGE facts below. Rules:\n"
    + "• Be concise and concrete. After each fact you use, cite it as [source: <title>].\n"
    + "• If the facts don't fully cover the question, say exactly what's missing — never fill gaps with guesses.\n"
    + "• No prices, numbers, or promises that aren't in the facts.\n"
    + "• Always reply in simple Indian English, whatever language the question was asked in.\n\n"
    + "COMPANY KNOWLEDGE:\n"
    + sources.map((s, i) => `${i + 1}. ${s.title ? `[${s.title}] ` : ""}${s.content}`).join("\n");
}

// --- Claude Fable 5 (Anthropic's most capable model) ------------------------
// Fable rules: thinking is always on (adaptive); no temperature/top_p/budget_tokens.
// We opt into a server-side fallback to Opus 4.8 so a rare policy decline still
// returns a grounded answer. `display: summarized` surfaces its reasoning.
async function answerWithFable(sys: string, q: string): Promise<Gen | null> {
  if (!ANTHROPIC) return null;
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "server-side-fallback-2026-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-fable-5",
        max_tokens: 3000,
        output_config: { effort: "medium" },
        thinking: { type: "adaptive", display: "summarized" },
        fallbacks: [{ model: "claude-opus-4-8" }],
        system: sys,
        messages: [{ role: "user", content: q }],
      }),
    });
    const j = await r.json();
    if (!r.ok || j?.stop_reason === "refusal") return null;
    const blocks: Array<{ type: string; text?: string; thinking?: string }> = Array.isArray(j?.content) ? j.content : [];
    const answer = blocks.filter((b) => b.type === "text").map((b) => b.text ?? "").join("").trim();
    const reasoning = blocks.filter((b) => b.type === "thinking").map((b) => b.thinking ?? "").join("\n").trim();
    if (!answer) return null;
    return { answer, reasoning, engine: "fable", model: String(j?.model ?? "claude-fable-5") };
  } catch (_e) {
    return null;
  }
}

// --- Groq fallback (llama-3.3-70b) ------------------------------------------
async function answerWithGroq(sys: string, q: string): Promise<Gen | null> {
  if (!GROQ) return null;
  try {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${GROQ}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile", temperature: 0.3, max_tokens: 400,
        messages: [{ role: "system", content: sys }, { role: "user", content: q }],
      }),
    });
    const j = await r.json();
    const answer: string = j.choices?.[0]?.message?.content?.trim() ?? "";
    if (!answer) return null;
    return { answer, reasoning: "", engine: "groq", model: "llama-3.3-70b-versatile" };
  } catch (_e) {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const auth = req.headers.get("Authorization") ?? "";
  const u = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
  const { data: ud } = await u.auth.getUser();
  if (!ud?.user) return json({ ok: false, error: "Unauthorized" }, 401);

  const { question } = await req.json().catch(() => ({}));
  const q = String(question ?? "").trim().slice(0, 500);
  if (q.length < 2) return json({ ok: false, error: "Ask a question." }, 400);

  const { data: prof } = await u.from("profiles").select("company_id").eq("id", ud.user.id).maybeSingle();
  if (!prof?.company_id) return json({ ok: false, error: "No company." }, 400);

  // Retrieve with scores. Low floor so we can SHOW weak matches and rate them
  // honestly, rather than hiding uncertainty. match_knowledge blends the company's
  // own chunks with the shared global brain, ownership-guarded (v4/v7 isolation).
  let sources: Src[] = [];
  try {
    const model = new Supabase.ai.Session("gte-small");
    const embedding = await model.run(q, { mean_pool: true, normalize: true });
    const { data } = await u.rpc("match_knowledge", {
      p_company: prof.company_id, p_embedding: embedding, p_match_count: 6, p_min_similarity: 0.15,
    });
    sources = Array.isArray(data) ? data as Src[] : [];
  } catch (_e) { /* none */ }

  const top = sources[0]?.similarity ?? 0;
  const confidence = top >= 0.6 ? "high" : top >= 0.42 ? "medium" : sources.length ? "low" : "none";

  // Nothing to stand on — be honest, don't invent.
  if (confidence === "none" || (!ANTHROPIC && !GROQ)) {
    return json({
      ok: true,
      confidence: "none",
      engine: ANTHROPIC ? "fable" : "groq",
      reasoning: "",
      answer: "I don't have this in the company knowledge yet. Add it under RAG → Train the AI (or AI Coach → Knowledge base), and I'll answer it accurately next time.",
      sources: [],
    });
  }

  const sys = buildSystem(sources);
  // Fable 5 first (the magic); Groq is the safety net if Fable is unavailable.
  const gen = (await answerWithFable(sys, q)) ?? (await answerWithGroq(sys, q));
  if (!gen) return json({ ok: false, error: "The AI engine is unavailable right now — try again." }, 200);

  return json({
    ok: true,
    confidence,
    engine: gen.engine,
    model: gen.model,
    reasoning: gen.reasoning,
    answer: gen.answer || "Couldn't compose an answer — try rephrasing.",
    // Return trimmed source snippets + scores so the UI can SHOW the working.
    sources: sources.slice(0, 4).map((s) => ({
      title: s.title,
      kind: s.source_kind,
      similarity: Math.round(s.similarity * 100),
      snippet: s.content.slice(0, 180),
    })),
  });
});
