// RAG v4 — the proactive brief. Instead of the rep opening a chat and typing,
// this reads THIS lead's context, retrieves the company's own knowledge that
// fits it, and returns a tiny "before you call" card: what to pitch + the most
// likely objection with a grounded answer. Company-isolated end to end:
//   • the contact is loaded through the CALLER's token (RLS → own company only)
//   • retrieval goes through match_knowledge, which verifies company ownership
// so company A can never brief on company B's data.
// Body: { contact_id }
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const auth = req.headers.get("Authorization") ?? "";
  const u = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
  const { data: ud } = await u.auth.getUser();
  if (!ud?.user) return json({ ok: false, error: "Unauthorized" }, 401);
  if (!GROQ) return json({ ok: false, error: "AI not configured." }, 200);

  const { contact_id } = await req.json().catch(() => ({}));
  if (!contact_id) return json({ ok: false, error: "missing contact_id" }, 400);

  // Load the lead through the CALLER's client — RLS guarantees it's their own
  // company's contact, or nothing comes back.
  const { data: c } = await u.from("contacts")
    .select("id, company_id, name, status, temperature, budget, notes, company_name")
    .eq("id", contact_id).maybeSingle();
  if (!c) return json({ ok: false, error: "Lead not found." }, 404);

  // Most recent call summary for extra context, if any (RLS-scoped too).
  const { data: lastCall } = await u.from("call_logs")
    .select("summary").eq("contact_id", contact_id).not("summary", "is", null)
    .order("started_at", { ascending: false }).limit(1).maybeSingle();

  // Build a retrieval query from what we know about the lead.
  const query = [
    c.company_name && `project ${c.company_name}`,
    c.budget && `budget ${c.budget}`,
    c.notes,
    lastCall?.summary,
    "price objections next step",
  ].filter(Boolean).join(". ").slice(0, 500);

  // Retrieve the company's own facts (match_knowledge verifies ownership).
  let facts: string[] = [];
  try {
    const model = new Supabase.ai.Session("gte-small");
    const embedding = await model.run(query, { mean_pool: true, normalize: true });
    const { data } = await u.rpc("match_knowledge", {
      p_company: c.company_id, p_embedding: embedding, p_match_count: 5, p_min_similarity: 0.28,
    });
    facts = Array.isArray(data) ? data.map((d: { title?: string; content: string }) => (d.title ? `[${d.title}] ` : "") + d.content) : [];
  } catch (_e) { /* no knowledge yet → generic brief */ }

  const ctx = [
    c.name && `Name: ${c.name}`,
    c.status && `Stage: ${c.status}`,
    c.temperature && `Interest: ${c.temperature}`,
    c.budget && `Budget: ${c.budget}`,
    c.company_name && `Project: ${c.company_name}`,
    c.notes && `Notes: ${c.notes}`,
    lastCall?.summary && `Last call: ${lastCall.summary}`,
  ].filter(Boolean).join("\n");

  const sys = "You are a real-estate sales coach. In UNDER 70 words, give the telecaller a "
    + "'before you call' brief for THIS lead, as 3 short bullets:\n"
    + "• Pitch: the one thing to lead with\n• Likely objection → your answer\n• Next step to ask for\n"
    + "Indian English, ready to speak. Use the COMPANY KNOWLEDGE facts (with their [source]) when relevant; "
    + "never invent prices — if a number isn't in the facts, say 'confirm the figure'."
    + (facts.length ? "\n\nCOMPANY KNOWLEDGE:\n" + facts.map((f, i) => `${i + 1}. ${f}`).join("\n") : "");

  try {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${GROQ}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile", temperature: 0.4, max_tokens: 260,
        messages: [{ role: "system", content: sys }, { role: "user", content: `Lead:\n${ctx}` }],
      }),
    });
    const j = await r.json();
    const brief: string = j.choices?.[0]?.message?.content?.trim() ?? "";
    if (!brief) return json({ ok: false, error: "no brief" }, 200);
    return json({ ok: true, brief, grounded: facts.length > 0 });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 200);
  }
});
