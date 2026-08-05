// AI lead scoring: ranks a telecaller's open leads (hot/warm/cold) and gives a
// one-line next action for each, in a single Groq call. The rep taps "AI Score"
// on the Leads tab; results are written back to contacts.temperature +
// ai_next_action. Free tier: console.groq.com -> GROQ_API_KEY secret.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { loadStages, terminalFilter } from "../_shared/stage.ts";

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
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GROQ = Deno.env.get("GROQ_API_KEY") ?? "";

// Don't re-score leads already closed/dead.
// CLOSED used to be a hand-written status list here. Whether a lead is
// finished is now answered once, by lead_stages.is_terminal.
const MAX_LEADS = 40;

const SYSTEM_PROMPT =
  "You are a real-estate sales manager triaging a telecaller's leads. For EACH " +
  "lead decide a temperature and the single best next action. " +
  'Reply ONLY with JSON: {"leads":[{"id": string, "temperature": "hot"|"warm"|"cold", "next_action": string}]}. ' +
  "hot = high budget / engaged / ready to move; warm = some interest, needs " +
  "nurturing; cold = unresponsive or low intent. next_action: a short imperative " +
  "(max ~8 words), e.g. 'Call this evening', 'Send brochure on WhatsApp', " +
  "'Schedule site visit'. Use the call summary when present. Keep every id exactly as given.";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!GROQ) return json({ ok: false, error: "GROQ_API_KEY is not configured." }, 500);

  const auth = req.headers.get("Authorization") ?? "";
  const u = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
  const { data: ud } = await u.auth.getUser();
  if (!ud?.user) return json({ ok: false, error: "Unauthorized" }, 401);

  // The rep's own open leads (RLS already scopes to them; filter anyway).
  const { data: leads } = await u.from("contacts")
    .select("id, name, status, budget, notes, temperature, created_at")
    .eq("salesperson_id", ud.user.id)
    .not("stage", "in", terminalFilter(await loadStages(u)))
    .order("created_at", { ascending: false })
    .limit(MAX_LEADS);
  if (!leads || leads.length === 0) return json({ ok: true, scored: 0 });

  // Enrich with each lead's most recent call summary (one query, newest first).
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

  const now = Date.now();
  const compact = leads.map((l) => ({
    id: l.id,
    name: l.name ?? "",
    status: l.status,
    budget: l.budget ?? "",
    notes: (l.notes ?? "").slice(0, 300),
    age_days: l.created_at ? Math.round((now - new Date(l.created_at).getTime()) / 86400000) : null,
    last_call: (latestSummary.get(l.id) ?? "").slice(0, 400),
  }));

  try {
    const ch = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST", headers: { Authorization: `Bearer ${GROQ}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile", temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Leads:\n${JSON.stringify(compact)}` },
        ],
      }),
    });
    const chj = await ch.json();
    const raw: string = chj.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(raw);
    const out: Array<{ id: string; temperature: string; next_action: string }> = parsed.leads ?? [];

    const admin = createClient(SUPABASE_URL, SERVICE);
    const validIds = new Set(ids);
    const validTemp = new Set(["hot", "warm", "cold"]);
    let scored = 0;
    const stamp = new Date().toISOString();
    for (const r of out) {
      if (!validIds.has(r.id) || !validTemp.has(r.temperature)) continue;
      await admin.from("contacts").update({
        temperature: r.temperature,
        ai_next_action: (r.next_action ?? "").slice(0, 120),
        ai_scored_at: stamp,
      }).eq("id", r.id);
      scored++;
    }
    return json({ ok: true, scored });
  } catch (e) {
    return json({ ok: false, error: String(e) });
  }
});
