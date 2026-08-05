// Sales Velocity — the Revenue Leak Radar.
//
// The one number that decides whether ad spend turns into sales, and that no
// dashboard here measured: SPEED TO LEAD — how long a lead waits before its
// first real call. It reads the SAME contacts + call_logs the coach/pulse read
// (via the lead_velocity SQL function, which enforces company isolation), then:
//   • buckets every lead by response time and shows the ADVANCE RATE per bucket,
//     proving with the owner's own numbers that speed = money;
//   • counts the silent killer — leads that were NEVER called (pure burnt spend);
//   • ranks companies and reps by median response and untouched leads;
//   • asks the LLM for the 3 moves that would convert the most extra deals.
//
// Body: { days?: number, cost_per_lead?: number }
// Auth: company admin (own company) or platform super-admin (all) — enforced in SQL.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { loadStages, isAdvanced } from "../_shared/stage.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const GROQ = Deno.env.get("GROQ_API_KEY") ?? "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

interface Lead {
  company_id: string | null; company_name: string | null;
  salesperson_id: string | null; rep_name: string | null;
  lead_id: string; source: string; created_at: string;
  first_call_at: string | null; minutes_to_first_call: number | null;
  calls: number; status: string;
}

// A lead that reached any of these actually moved forward — that's the outcome
// speed is measured against (same stage list the funnel uses elsewhere).
// ADVANCED used to be a hand-written Set. "Reached Interested or beyond and
// not lost" is now one answer, from lead_stages.is_advanced.
const DEAD = new Set(["not_interested", "lost", "dnc", "invalid"]);

const BUCKETS: { key: string; label: string; max: number }[] = [
  { key: "b5", label: "0-5 min", max: 5 },
  { key: "b30", label: "5-30 min", max: 30 },
  { key: "b120", label: "30 min - 2 hrs", max: 120 },
  { key: "b1440", label: "2 - 24 hrs", max: 1440 },
  { key: "bmore", label: "24 hrs+", max: Number.POSITIVE_INFINITY },
];

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round(((s[m - 1] + s[m]) / 2) * 10) / 10;
}
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const auth = req.headers.get("Authorization") ?? "";
  const u = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
  const { data: ud } = await u.auth.getUser();
  if (!ud?.user) return json({ ok: false, error: "Unauthorized" }, 401);

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const days = Math.min(Math.max(Number(body.days) || 30, 1), 180);
  const costPerLead = Number(body.cost_per_lead) > 0 ? Number(body.cost_per_lead) : 0;

  const { data, error } = await u.rpc("lead_velocity", { p_days: days });
  if (error) return json({ ok: false, error: error.message }, 200);
  const leads = (data ?? []) as Lead[];
  if (leads.length === 0) return json({ ok: true, empty: true, days });

  // One read of the canonical stage table; every classification below uses it.
  const stages = await loadStages(u);

  // ---- Buckets + the proof: advance rate by response speed ----
  const buckets = BUCKETS.map((b) => ({ ...b, leads: 0, advanced: 0 }));
  let neverCalled = 0, neverCalledAdvanced = 0;
  const responded: number[] = [];

  for (const l of leads) {
    const adv = isAdvanced(stages, l.status);
    if (l.minutes_to_first_call == null) {
      neverCalled++;
      if (adv) neverCalledAdvanced++;
      continue;
    }
    const mins = Math.max(0, l.minutes_to_first_call);
    responded.push(mins);
    const b = buckets.find((x) => mins <= x.max)!;
    b.leads++;
    if (adv) b.advanced++;
  }

  const bucketRows = buckets
    .filter((b) => b.leads > 0)
    .map((b) => ({ label: b.label, leads: b.leads, advanced: b.advanced, advance_pct: pct(b.advanced, b.leads) }));

  // Fast = answered inside 30 minutes; slow = after 2 hours. The gap between
  // those two advance rates is the money the team is leaving on the table.
  const fast = buckets.filter((b) => b.max <= 30).reduce((s, b) => ({ l: s.l + b.leads, a: s.a + b.advanced }), { l: 0, a: 0 });
  const slow = buckets.filter((b) => b.max > 120).reduce((s, b) => ({ l: s.l + b.leads, a: s.a + b.advanced }), { l: 0, a: 0 });
  const fastPct = pct(fast.a, fast.l);
  const slowPct = pct(slow.a, slow.l);
  const speedMultiple = slowPct > 0 ? Math.round((fastPct / slowPct) * 10) / 10 : null;

  // Extra deals that would exist if every lead were answered like the fast ones.
  const missedDeals = fastPct > 0
    ? Math.max(0, Math.round(((fastPct - slowPct) / 100) * (slow.l + neverCalled)))
    : 0;

  const summary = {
    days,
    total_leads: leads.length,
    never_called: neverCalled,
    never_called_pct: pct(neverCalled, leads.length),
    never_called_advanced: neverCalledAdvanced,
    median_minutes: median(responded),
    answered_in_30m_pct: pct(fast.l, leads.length),
    fast_advance_pct: fastPct,
    slow_advance_pct: slowPct,
    speed_multiple: speedMultiple,
    missed_deals: missedDeals,
    burnt_spend: costPerLead > 0 ? Math.round(costPerLead * neverCalled) : null,
  };

  // ---- Who: per company and per rep ----
  function group(keyOf: (l: Lead) => string, nameOf: (l: Lead) => string) {
    const m = new Map<string, { name: string; leads: number; never: number; advanced: number; mins: number[] }>();
    for (const l of leads) {
      const k = keyOf(l);
      if (!k) continue;
      const g = m.get(k) ?? { name: nameOf(l) || "—", leads: 0, never: 0, advanced: 0, mins: [] };
      g.leads++;
      if (l.minutes_to_first_call == null) g.never++;
      else g.mins.push(Math.max(0, l.minutes_to_first_call));
      if (isAdvanced(stages, l.status)) g.advanced++;
      m.set(k, g);
    }
    return [...m.entries()]
      .map(([id, g]) => ({
        id, name: g.name, leads: g.leads, never_called: g.never,
        never_pct: pct(g.never, g.leads),
        median_minutes: median(g.mins),
        advance_pct: pct(g.advanced, g.leads),
      }))
      .sort((a, b) => b.leads - a.leads);
  }
  const companies = group((l) => l.company_id ?? "", (l) => l.company_name ?? "");
  const reps = group((l) => l.salesperson_id ?? "", (l) => l.rep_name ?? "");
  const unassigned = leads.filter((l) => !l.salesperson_id).length;

  // ---- The leak list: uncalled leads, oldest first — each one is paid-for. ----
  const now = Date.now();
  const leakList = leads
    .filter((l) => l.minutes_to_first_call == null && !DEAD.has(l.status))
    .map((l) => ({
      name: l.rep_name ?? null,
      company: l.company_name ?? null,
      source: l.source,
      age_hours: Math.round((now - Date.parse(l.created_at)) / 36e5),
      status: l.status,
    }))
    .sort((a, b) => b.age_hours - a.age_hours)
    .slice(0, 10);

  // ---- AI verdict: three moves, grounded in these exact numbers ----
  let verdict: Record<string, unknown> | null = null;
  if (GROQ) {
    const sys =
      "You are a hard-nosed sales operations advisor for an Indian real-estate lead-gen business. You are given SPEED-TO-LEAD " +
      "data: how fast leads get their first call, how many are never called at all, and how the advance rate (lead reaching " +
      "interested / site visit / booking) differs by response speed, per company and per rep. " +
      'Reply ONLY as JSON: {"verdict": string, "moves": [{"title": string, "why": string, "how": string}], "one_number": string}. ' +
      "verdict = one blunt sentence naming the biggest money leak, quoting the real figures. moves = exactly 3, ranked by rupees " +
      "recovered; 'why' MUST cite the actual numbers given, 'how' is a concrete operational step a manager can do this week " +
      "(routing, SLA, staffing, follow-up rules, alerts). one_number = the single KPI to fix first, phrased as a target " +
      "(e.g. 'Answer 80% of leads within 30 minutes'). Plain English, no fluff, never invent numbers.";
    const usr =
      `Window: last ${days} days.\nSummary: ${JSON.stringify(summary)}\n` +
      `Response-time buckets (advance % = reached interested/site-visit/booking):\n${JSON.stringify(bucketRows)}\n` +
      `By company: ${JSON.stringify(companies.slice(0, 8))}\n` +
      `By rep: ${JSON.stringify(reps.slice(0, 10))}\nLeads with no rep assigned: ${unassigned}`;
    try {
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${GROQ}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile", temperature: 0.35, response_format: { type: "json_object" },
          messages: [{ role: "system", content: sys }, { role: "user", content: usr }],
        }),
      });
      verdict = JSON.parse((await r.json()).choices?.[0]?.message?.content ?? "{}");
    } catch (_e) {
      verdict = null;
    }
  }

  return json({ ok: true, summary, buckets: bucketRows, companies, reps, unassigned, leak_list: leakList, verdict });
});
