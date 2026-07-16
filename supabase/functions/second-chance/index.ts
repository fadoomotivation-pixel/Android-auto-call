// RAG v13 — "Second Chance". Every telecaller sits on a pile of dead leads
// (lost / not interested / gone-cold). This picks up to FIVE worth calling
// AGAIN — because something changed: a new offer, a price move, a new project
// from the company's knowledge base. Each pick comes with why it's revivable
// and a warm re-opening line that politely acknowledges the earlier "no".
// DNC numbers are never touched. Auth: the signed-in rep. Body: {}.
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

const SYSTEM_PROMPT =
  "You are a veteran real-estate sales manager mining a telecaller's DEAD leads for " +
  "revivable deals. These customers said no or went cold weeks ago. Pick AT MOST FIVE " +
  "worth calling again TODAY — only where a real angle exists: a matching new offer or " +
  "price move in the COMPANY FACTS, a budget that now fits, an objection that time may " +
  "have softened (loan approved, family discussion done), or a high-budget lead dropped " +
  "after only 1-2 tries. Skip hopeless ones — fewer good picks beat five weak ones.\n" +
  'Reply ONLY with JSON: {"picks":[{"id": string, "reason": string, "opener": string}]} ' +
  "— ids exactly as given, best first.\n" +
  "reason: max ~10 words, simple English, why THIS one is revivable (e.g. 'New payment " +
  "plan fits their loan problem').\n" +
  "opener: 1-2 short natural Hinglish lines the rep will SAY on the phone. ALWAYS address " +
  "the customer with respectful 'aap' — never tu/tum. Politely acknowledge the earlier " +
  "conversation, then give the NEW reason for calling (a real fact from COMPANY FACTS when " +
  "it fits — never invent a price or offer). Warm, zero pressure, end with a soft question.";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!GROQ) return json({ ok: false, error: "AI is not configured (GROQ_API_KEY)." }, 200);

  const auth = req.headers.get("Authorization") ?? "";
  const u = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
  const { data: ud } = await u.auth.getUser();
  if (!ud?.user) return json({ ok: false, error: "Unauthorized" }, 401);

  // The dead pile: said-no leads, plus gone-cold ones that were tried and
  // dropped. NEVER dnc — a Do-Not-Call stays a Do-Not-Call.
  const [saidNo, wentCold] = await Promise.all([
    u.from("contacts")
      .select("id, name, status, budget, notes, temperature, attempts, company_name, created_at")
      .eq("salesperson_id", ud.user.id)
      .in("status", ["lost", "not_interested"])
      .order("created_at", { ascending: false })
      .limit(40),
    u.from("contacts")
      .select("id, name, status, budget, notes, temperature, attempts, company_name, created_at")
      .eq("salesperson_id", ud.user.id)
      .eq("temperature", "cold")
      .not("status", "in", "(booked,lost,not_interested,dnc)")
      .gte("attempts", 2)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  const leads = [...(saidNo.data ?? []), ...(wentCold.data ?? [])];
  if (leads.length === 0) return json({ ok: true, picks: [] });

  // What the customer actually said last time — the objection is the door.
  const ids = leads.map((l) => l.id);
  const { data: calls } = await u.from("call_logs")
    .select("contact_id, summary, started_at")
    .in("contact_id", ids)
    .not("summary", "is", null)
    .order("started_at", { ascending: false });
  const latestSummary = new Map<string, string>();
  for (const c of calls ?? []) {
    if (c.contact_id && !latestSummary.has(c.contact_id)) latestSummary.set(c.contact_id, c.summary);
  }

  // The revival fuel: the company's FRESH angles — offers, price moves, new
  // launches, payment plans (company-isolated + shared global brain).
  let facts: string[] = [];
  const { data: prof } = await u.from("profiles").select("company_id").eq("id", ud.user.id).maybeSingle();
  if (prof?.company_id) {
    try {
      const model = new Supabase.ai.Session("gte-small");
      const embedding = await model.run(
        "new offer discount festive scheme price drop payment plan EMI new launch possession ready",
        { mean_pool: true, normalize: true },
      );
      const { data } = await u.rpc("match_knowledge", {
        p_company: prof.company_id, p_embedding: embedding, p_match_count: 6, p_min_similarity: 0.25,
      });
      if (Array.isArray(data)) {
        facts = data.map((d: { title?: string; content: string }) => (d.title ? `[${d.title}] ` : "") + d.content);
      }
    } catch (_e) { /* openers just stay generic */ }
  }

  const now = Date.now();
  const compact = leads.map((l) => ({
    id: l.id,
    name: l.name ?? "",
    status: l.status,
    temperature: l.temperature ?? "",
    budget: l.budget ?? "",
    attempts: l.attempts ?? 0,
    project: l.company_name ?? "",
    age_days: l.created_at ? Math.round((now - new Date(l.created_at).getTime()) / 86400000) : null,
    notes: (l.notes ?? "").slice(0, 200),
    last_call: (latestSummary.get(l.id) ?? "").slice(0, 300),
  }));

  const userMsg =
    (facts.length ? `COMPANY FACTS (fresh angles):\n${facts.map((f, i) => `${i + 1}. ${f}`).join("\n")}\n\n` : "") +
    `Today: ${new Date().toISOString().slice(0, 10)}\nDead leads:\n${JSON.stringify(compact)}`;

  try {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${GROQ}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile", temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMsg },
        ],
      }),
    });
    const j = await r.json();
    const parsed = JSON.parse(j.choices?.[0]?.message?.content ?? "{}");
    const validIds = new Set(ids);
    const picks = (Array.isArray(parsed.picks) ? parsed.picks : [])
      .filter((p: { id?: string }) => p?.id && validIds.has(p.id))
      .slice(0, 5)
      .map((p: { id: string; reason?: string; opener?: string }) => ({
        id: p.id,
        reason: String(p.reason ?? "").slice(0, 140),
        opener: String(p.opener ?? "").slice(0, 400),
      }));
    return json({ ok: true, picks });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 200);
  }
});
