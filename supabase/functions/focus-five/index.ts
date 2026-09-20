// RAG v11 — "Aaj ke 5". Out of a rep's 100+ open leads, pick the FIVE most
// likely to move TODAY — each with a short reason and a ready-to-speak opening
// line grounded in the company's own knowledge (projects / prices / offers via
// match_knowledge, company-isolated). Focus is the feature: the rep starts the
// day with five winnable conversations, not a wall of 137 rows.
// Auth: the signed-in rep. Body: {} — everything is derived from their leads.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { loadStages, terminalFilter } from "../_shared/stage.ts";

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

// CLOSED used to be a hand-written status list here. Whether a lead is
// finished is now answered once, by lead_stages.is_terminal.
const MAX_LEADS = 60;

const SYSTEM_PROMPT =
  "You are a sharp real-estate sales manager planning a telecaller's day. From the " +
  "leads given, pick the FIVE most likely to MOVE TODAY (visit-done leads to close, " +
  "overdue callbacks, hot/engaged leads, fresh high-budget leads). Reply ONLY with " +
  'JSON: {"picks":[{"id": string, "reason": string, "opener": string}]} — at most 5 ' +
  "picks, ids exactly as given, best first.\n" +
  "reason: max ~8 words, simple Indian English, for the rep — respectful in tone " +
  "form, e.g. 'Visit ho chuki — aaj close karein'.\n" +
  "opener: 1-2 short natural lines in simple Indian English the rep will SAY to the customer. ALWAYS " +
  "address the customer with respectful 'aap' — never tu/tum.\n" +
  "USE where_we_left_it WHEN IT IS THERE. It is the distilled truth of what was actually said on the calls and " +
  "on WhatsApp, and an opener built from it beats anything built from the record. what_stopped_them is the " +
  "objection the buyer raised in their own words — answer it in the opener rather than talking around it. " +
  "Never contradict either, and never invent one when it is absent.\n" +
  "you_promised is something THE REP HERSELF said on a recorded call that she would do and has not done. A lead " +
  "carrying it is almost always a top pick: the customer is waiting for exactly that. The opener must DELIVER it " +
  "— lead with the thing itself, warmly and without apologising twice (e.g. 'Rakesh ji, 2BHK ka floor plan main " +
  "abhi WhatsApp kar rahi hoon — ek baar dekh lijiye'). Never open by asking how they are while the thing you " +
  "promised is still not sent.\n" +
  "The opener MUST be SPECIFIC to THIS lead and PICK UP THE THREAD — use the lead's " +
  "NAME, and reference their last_call / notes / stage / budget (e.g. 'pichhli baar " +
  "aapne 2BHK ke baare me poochha tha', 'aapki site visit ho chuki hai'), then drive " +
  "the ONE next step for that stage (site-visit done → ask for booking/decision; hot " +
  "→ lock a site visit with a day/time; callback → the promised follow-up). Where a " +
  "COMPANY FACT fits (a real project / price / offer), weave it in — never invent " +
  "numbers.\n" +
  "Every opener must be DIFFERENT from the others — no template. NEVER use the empty " +
  "filler line 'Aapka interest kitna hai?' or a generic 'main aapko details bhejna " +
  "chahta hoon' with nothing specific. Make each line something a real closer would say.";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!GROQ) return json({ ok: false, error: "AI is not configured (GROQ_API_KEY)." }, 200);

  const auth = req.headers.get("Authorization") ?? "";
  const u = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
  const { data: ud } = await u.auth.getUser();
  if (!ud?.user) return json({ ok: false, error: "Unauthorized" }, 401);

  // The rep's own open leads (RLS scopes anyway; filter defensively).
  const { data: leads } = await u.from("contacts")
    .select("id, name, status, budget, notes, temperature, ai_next_action, site_visit_at, created_at")
    .eq("salesperson_id", ud.user.id)
    .not("stage", "in", terminalFilter(await loadStages(u)))
    .order("created_at", { ascending: false })
    .limit(MAX_LEADS);
  if (!leads || leads.length === 0) return json({ ok: true, picks: [] });

  // Latest call summary per lead — what the customer actually said last time.
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

  // WHAT WAS ACTUALLY SAID — CALLS AND WHATSAPP, DISTILLED ONCE.
  //
  // The prompt below has always told the model to "pick up the thread" and
  // "reference the last call". It was being asked to do that with a timestamp,
  // the rep's notes, and a call summary that on a dead lead reads "no
  // conversation took place". It had never seen a transcript, and it had never
  // seen a single WhatsApp message — which is where an Indian real-estate
  // buyer says the real thing ("rate thoda zyada lag raha hai" gets typed at
  // 11pm, never said on the phone).
  //
  // lead_memory holds one distilled line per lead, built from both channels by
  // the hourly harvest (migration 0209). Reading it here costs one indexed
  // query and no extra tokens at pick time, and it is the difference between
  // an opener that says "following up sir" and one that says "Balaji me 2BHK
  // dekha tha, rate pe ruke the — maine manager se baat kar li hai".
  const memory = new Map<string, { thread: string; wants: string; blocker: string }>();
  {
    const { data: mem } = await u.from("lead_memory")
      .select("contact_id, where_we_left_it, buyer_wants, objection")
      .in("contact_id", ids);
    for (const m of mem ?? []) {
      if (!m.contact_id) continue;
      memory.set(m.contact_id, {
        thread: String(m.where_we_left_it ?? ""),
        wants: String(m.buyer_wants ?? ""),
        blocker: String(m.objection ?? ""),
      });
    }
  }

  // WHAT SHE ALREADY TOLD THEM SHE WOULD DO.
  //
  // Of 82 leads who discussed a site visit on a recorded call, 70 received no
  // WhatsApp at all afterwards (migration 0211). An open promise is therefore
  // the single strongest reason to ring someone today: the buyer is expecting
  // the call, the rep has an obvious first sentence, and it is the one thing
  // in this whole list she can close in sixty seconds.
  //
  // It also fixes an opener that would otherwise be embarrassing — "sir aapse
  // baat karni thi" to a man still waiting for the floor plan she promised on
  // Tuesday.
  const owed = new Map<string, string>();
  {
    const { data: promises } = await u.from("v_open_promises")
      .select("contact_id, promise, days_open")
      .in("contact_id", ids)
      .eq("status", "missed")
      .order("days_open", { ascending: false });
    for (const p of promises ?? []) {
      if (p.contact_id && !owed.has(p.contact_id)) {
        owed.set(p.contact_id, `${p.promise} (${p.days_open}d ago, still not done)`);
      }
    }
  }

  // Company facts (RAG, ownership-guarded + shared global brain) so openers can
  // name a real project / price / offer instead of being generic.
  let facts: string[] = [];
  const { data: prof } = await u.from("profiles").select("company_id").eq("id", ud.user.id).maybeSingle();
  if (prof?.company_id) {
    try {
      const model = new Supabase.ai.Session("gte-small");
      const embedding = await model.run("project price offer location site visit USP", { mean_pool: true, normalize: true });
      const { data } = await u.rpc("match_knowledge", {
        p_company: prof.company_id, p_embedding: embedding, p_match_count: 5, p_min_similarity: 0.25,
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
    next_action: l.ai_next_action ?? "",
    site_visit_at: l.site_visit_at ?? "",
    age_days: l.created_at ? Math.round((now - new Date(l.created_at).getTime()) / 86400000) : null,
    notes: (l.notes ?? "").slice(0, 200),
    last_call: (latestSummary.get(l.id) ?? "").slice(0, 300),
    // The three that come from the conversation itself rather than from the
    // shape of the record. Omitted entirely when unknown — an empty key
    // invites the model to fill it, and a made-up "where we left it" is a
    // sentence the rep will say out loud to a real buyer.
    ...(memory.get(l.id)?.thread ? { where_we_left_it: memory.get(l.id)!.thread } : {}),
    ...(memory.get(l.id)?.wants ? { buyer_wants: memory.get(l.id)!.wants } : {}),
    ...(memory.get(l.id)?.blocker ? { what_stopped_them: memory.get(l.id)!.blocker } : {}),
    ...(owed.get(l.id) ? { you_promised: owed.get(l.id) } : {}),
  }));

  const userMsg =
    (facts.length ? `COMPANY FACTS:\n${facts.map((f, i) => `${i + 1}. ${f}`).join("\n")}\n\n` : "") +
    `Today: ${new Date().toISOString().slice(0, 10)}\nLeads:\n${JSON.stringify(compact)}`;

  try {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${GROQ}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: (Deno.env.get("GROQ_MODEL") ?? "openai/gpt-oss-120b"), temperature: 0.55,
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
        reason: String(p.reason ?? "").slice(0, 120),
        opener: String(p.opener ?? "").slice(0, 400),
      }));
    return json({ ok: true, picks });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 200);
  }
});
