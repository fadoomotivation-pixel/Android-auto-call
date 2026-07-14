// RAG v6 — the "glass box". Ask the company's AI anything and get back not just
// an answer, but HOW it knows: the exact source facts it used, each with a match
// score, plus an honest confidence rating. If it doesn't have the facts, it says
// so rather than bluffing. Company-isolated (match_knowledge verifies ownership).
// Body: { question }
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

type Src = { title: string | null; content: string; source_kind: string; similarity: number };

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
  // honestly, rather than hiding uncertainty.
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
  if (confidence === "none" || !GROQ) {
    return json({
      ok: true,
      confidence: "none",
      answer: "I don't have this in the company knowledge yet. Add it under AI Coach → Knowledge base, and I'll answer it accurately next time.",
      sources: [],
    });
  }

  const sys = "You answer ONLY from the COMPANY KNOWLEDGE facts below. Rules:\n"
    + "• Be concise and concrete. Cite the [source] label after each fact you use.\n"
    + "• If the facts don't fully cover the question, say exactly what's missing — never fill gaps with guesses.\n"
    + "• No prices or numbers that aren't in the facts.\n\n"
    + "COMPANY KNOWLEDGE:\n"
    + sources.map((s, i) => `${i + 1}. ${s.title ? `[${s.title}] ` : ""}${s.content}`).join("\n");

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
    return json({
      ok: true,
      confidence,
      answer: answer || "Couldn't compose an answer — try rephrasing.",
      // Return trimmed source snippets + scores so the UI can SHOW the working.
      sources: sources.slice(0, 4).map((s) => ({
        title: s.title,
        kind: s.source_kind,
        similarity: Math.round(s.similarity * 100),
        snippet: s.content.slice(0, 180),
      })),
    });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 200);
  }
});
