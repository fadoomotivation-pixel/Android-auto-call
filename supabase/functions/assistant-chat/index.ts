// AI sales assistant for telecallers. A lightweight chat coach: objection
// handling, what-to-say, next steps, pitch help. Uses Groq (free tier) like the
// rest of the app's AI. Body: { messages: [{role,content}], lead?: {...} }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

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

// Supabase Edge's built-in embedding model (gte-small, 384-dim) — used to
// retrieve the company's own knowledge for the coach (RAG). Free, no key.
declare const Supabase: { ai: { Session: new (m: string) => { run(input: string, opts: { mean_pool: boolean; normalize: boolean }): Promise<number[]> } } };

/** Retrieve the most relevant company-knowledge chunks for a question. */
async function retrieveKnowledge(u: ReturnType<typeof createClient>, companyId: string, question: string): Promise<string[]> {
  try {
    const model = new Supabase.ai.Session("gte-small");
    const embedding = await model.run(question, { mean_pool: true, normalize: true });
    const { data } = await u.rpc("match_knowledge", {
      p_company: companyId, p_embedding: embedding, p_match_count: 5, p_min_similarity: 0.3,
    });
    return Array.isArray(data) ? data.map((d: { title?: string; content: string }) => (d.title ? `[${d.title}] ` : "") + d.content) : [];
  } catch (_e) {
    return [];
  }
}

const SYSTEM = `You are a sharp, friendly sales coach for telecallers at an Indian company (real estate / services CRM).
Help the rep close more deals. Be concise and practical — short answers, ready to use on a live call or in a WhatsApp reply.
When the rep faces an objection, give 2-3 specific lines they can say. Indian English, simple words.
Any line meant to be SAID to a customer must be respectful and polite — never casual or familiar. Address the rep respectfully too. Write in simple Indian English, not Hindi or Hinglish.
If lead context is given, tailor advice to that lead. Never invent facts about the company or prices; if unknown, tell the rep to confirm. Keep replies under ~120 words unless asked for more.`;

// RAG v10 — "Practice mode". The AI PLAYS a realistic customer so the rep can
// rehearse. Objections + buying signals are grounded in the company's own
// playbook so practice mirrors real calls. Breaks character only to score.
const ROLEPLAY = `You are roleplaying as a realistic, slightly skeptical Indian real-estate customer on a phone call, so a telecaller can PRACTICE. Rules:
- Stay FULLY in character as the customer. Reply in simple Indian English, 1-3 short lines, like a real call. Never say you are an AI, never coach mid-call.
- Raise natural doubts and objections — price, location, loan/EMI, "I need to discuss with my family", comparing other projects. Use the COMPANY KNOWLEDGE below to make your doubts and buying-signals specific and realistic (mention real projects / prices when it fits).
- React to the rep: warm up and show interest when they answer well; stay cool if they dodge or bluff. Do NOT make it too easy — but if they genuinely convince you, you may agree to a site visit.
- If the FIRST user message is "__begin__", open the call in character: a short greeting, then your first doubt.
- As the customer, speak politely, the way a real Indian buyer would.
- ONLY when the rep says "score", "end", or "done": break character and give a short coaching scorecard in respectful simple Indian English — "Score: X/10", 2 things you did well, 2 you missed (if the playbook had a winning line, point it out), and 1 stronger line for next time.`;

type Msg = { role: string; content: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const auth = req.headers.get("Authorization") ?? "";
  const u = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
  const { data: ud } = await u.auth.getUser();
  if (!ud?.user) return json({ ok: false, error: "Unauthorized" }, 401);

  if (!GROQ) return json({ ok: false, error: "AI is not configured (GROQ_API_KEY)." }, 200);

  const { messages, lead, mode } = await req.json().catch(() => ({ messages: [] }));
  const history: Msg[] = Array.isArray(messages) ? messages.slice(-12) : [];
  if (history.length === 0) return json({ ok: false, error: "empty" }, 400);

  const isRoleplay = mode === "roleplay";
  let sys = isRoleplay ? ROLEPLAY : SYSTEM;
  // Lead context only tailors the coach; the practice customer stays generic.
  if (!isRoleplay && lead && typeof lead === "object") {
    const parts = [
      lead.name && `Name: ${lead.name}`,
      lead.status && `Status: ${lead.status}`,
      lead.temperature && `Temperature: ${lead.temperature}`,
      lead.notes && `Notes: ${lead.notes}`,
    ].filter(Boolean).join("; ");
    if (parts) sys += `\n\nCurrent lead — ${parts}`;
  }

  // RAG — pull the company's own facts for the rep's latest question and give
  // them to the model as ground truth, so the coach quotes real prices /
  // project details instead of guessing.
  const { data: prof } = await u.from("profiles").select("company_id").eq("id", ud.user.id).maybeSingle();
  const lastUser = [...history].reverse().find((m) => m.role !== "assistant");
  const seed = lastUser?.content === "__begin__";
  if (prof?.company_id && lastUser?.content) {
    // For the roleplay opener ("__begin__") retrieve on a generic buyer query so
    // the AI customer has real projects/prices to reference from turn one.
    const query = seed ? "flat price project location offer site visit" : String(lastUser.content).slice(0, 500);
    const facts = await retrieveKnowledge(u, prof.company_id, query);
    if (facts.length > 0) {
      sys += isRoleplay
        ? "\n\nCOMPANY KNOWLEDGE — the company's real projects, prices and offers. Use these to make "
          + "your doubts and buying-signals specific and believable (name a real project/price when it fits):\n"
          + facts.map((f, i) => `${i + 1}. ${f}`).join("\n")
        : "\n\nCOMPANY KNOWLEDGE — these are the company's OWN verified facts (price lists, "
          + "brochures, and transcripts of calls that actually closed). Prefer them over any "
          + "guess. When you use one, name its source in brackets like the label shown. If the "
          + "answer isn't in here, say clearly that the rep should confirm — do NOT invent it:\n"
          + facts.map((f, i) => `${i + 1}. ${f}`).join("\n");
    } else if (!isRoleplay && !seed) {
      // Active learning (RAG v3): the coach had no company knowledge for this
      // question. Record the gap so the admin can fill it — the knowledge base
      // grows toward what the team actually asks. (Practice turns never log gaps.)
      u.rpc("log_knowledge_gap", { p_company: prof.company_id, p_question: String(lastUser.content).slice(0, 300) })
        .then(() => {}, () => {});
    }
  }

  try {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${GROQ}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile", temperature: isRoleplay ? 0.7 : 0.4, max_tokens: 500,
        messages: [{ role: "system", content: sys }, ...history.map((m) => ({
          role: m.role === "assistant" ? "assistant" : "user", content: String(m.content ?? "").slice(0, 4000),
        }))],
      }),
    });
    const j = await r.json();
    const reply: string = j.choices?.[0]?.message?.content?.trim() ?? "";
    if (!reply) return json({ ok: false, error: "no reply" }, 200);
    return json({ ok: true, reply });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 200);
  }
});
