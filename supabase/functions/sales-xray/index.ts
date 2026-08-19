// Sales X-Ray — reads EVERY conversation from the last N days in one AI pass
// and gives the owner what no amount of listening can: the patterns.
//
//   • objections: what's killing deals, ranked, with a real quote + a counter
//   • demand: what buyers keep asking for (BHK / location / budget)
//   • winning: what the successful calls had in common
//   • gold: dead-looking leads the AI believes are recoverable — with the
//     exact opening line for the win-back call
//
// Body: { days?: number (default 30), company_id?: uuid (super-admin only),
//         all_companies?: true (service/cron only) }
// Auth: company admin (JWT) or super-admin; the weekly pg_cron calls it with
// the service key + all_companies to refresh every active company.
// Secret: GROQ_API_KEY.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

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

const SYSTEM = (
  "You are a razor-sharp real-estate sales analyst for an Indian telecalling team. " +
  "You get one line per lead: funnel status, temperature, budget, requirements and " +
  "the telecaller's call notes (Hindi/Hinglish/English). Find the PATTERNS. " +
  'Reply ONLY JSON: {"headline": string, ' +
  '"objections": [{"label": string, "count": number, "quote": string, "fix": string}], ' +
  '"demand": [{"what": string, "count": number}], ' +
  '"winning": [string], ' +
  '"gold": [{"name": string, "phone": string, "why": string, "opener": string}], ' +
  '"advice": [string]}. ' +
  "headline: 1-2 punchy sentences in simple Indian English — the state of this pipeline. " +
  "objections: the ranked deal-killers ACROSS calls (price, location, loan, trust, " +
  "timing …) with how many leads said it, one real quote (translated to simple " +
  "simple Indian English), and a concrete counter-script the telecallers should use. Max 5. " +
  "demand: what buyers asked for — BHK types, locations, budget bands, plot/flat. Max 6. " +
  "winning: 2-3 things the calls that reached site-visit/booked had in common. " +
  "gold: leads that LOOK dead (callback ignored / not_interested with a soft reason / " +
  "went silent) but are genuinely winnable — pick up to 6, why in one line, and a " +
  "natural opening line in simple Indian English for the win-back call. NEVER pick dnc/invalid/booked. " +
  "advice: 3 concrete moves for the owner this week. Ground EVERYTHING in the data; " +
  "never invent leads or numbers."
);

async function xray(admin: SupabaseClient, companyId: string, days: number) {
  const since = new Date(Date.now() - days * 86400_000).toISOString();

  const [{ data: notes }, { data: contacts }] = await Promise.all([
    admin.from("lead_voice_notes")
      .select("contact_id, summary, transcript, suggested_disposition, created_at")
      .eq("company_id", companyId).eq("ai_status", "ready")
      .gte("created_at", since).order("created_at", { ascending: false }).limit(150),
    admin.from("contacts")
      .select("id, name, phone, status, temperature, budget, extra, created_at")
      .eq("company_id", companyId).not("salesperson_id", "is", null)
      .gte("created_at", since).limit(500),
  ]);

  const byId = new Map((contacts ?? []).map((c) => [c.id, c]));
  // Merge each lead's notes into one line; leads without notes still contribute
  // status/demand signal.
  const noteByContact = new Map<string, string[]>();
  for (const n of notes ?? []) {
    const arr = noteByContact.get(n.contact_id) ?? [];
    const txt = (n.summary || n.transcript || "").replace(/\s+/g, " ").slice(0, 220);
    if (txt) arr.push(txt);
    noteByContact.set(n.contact_id, arr);
  }

  const lines: string[] = [];
  for (const [cid, txts] of noteByContact) {
    const c = byId.get(cid);
    const reqs = c?.extra && typeof c.extra === "object"
      ? JSON.stringify((c.extra as Record<string, unknown>).requirements ?? "") : "";
    lines.push(
      `[${c?.status ?? "?"}|${c?.temperature ?? "-"}|${c?.budget ?? "-"}] ${c?.name ?? "?"} ${c?.phone ?? ""} ` +
      `${reqs && reqs !== '""' ? "needs:" + reqs + " " : ""}notes: ${txts.slice(0, 3).join(" / ")}`,
    );
  }
  // Status distribution gives the model the denominator.
  const statusCount = new Map<string, number>();
  for (const c of contacts ?? []) statusCount.set(c.status, (statusCount.get(c.status) ?? 0) + 1);
  const distribution = [...statusCount.entries()].map(([s, n]) => `${s}:${n}`).join(", ");

  if (lines.length < 3) return { skipped: "not enough conversations", conversations: lines.length };

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${GROQ}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile", temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `Last ${days} days. Lead status distribution: ${distribution}.\n` +
            `Conversations (one line per lead):\n${lines.join("\n").slice(0, 24000)}`,
        },
      ],
    }),
  });
  const cj = await res.json();
  const raw: string = cj.choices?.[0]?.message?.content ?? "";
  let report: Record<string, unknown>;
  try {
    report = JSON.parse(raw);
  } catch {
    return { skipped: "model returned non-JSON", raw: raw.slice(0, 200) };
  }
  report.stats = { conversations: lines.length, leads: (contacts ?? []).length, days, distribution };

  await admin.from("sales_xray").insert({ company_id: companyId, days, report });
  return { report };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!GROQ) return json({ ok: false, error: "GROQ_API_KEY is not configured." }, 500);

  const auth = req.headers.get("Authorization") ?? "";
  const bearer = auth.replace(/^Bearer\s+/i, "").trim();
  const admin = createClient(SUPABASE_URL, SERVICE);
  const body = await req.json().catch(() => ({}));
  const days = Number.isFinite(body?.days) && body.days >= 7 && body.days <= 90 ? Math.floor(body.days) : 30;

  // Weekly cron path (service key): refresh every company that has voice notes.
  if (bearer === SERVICE) {
    if (body?.all_companies) {
      const { data: cs } = await admin.from("lead_voice_notes").select("company_id").limit(1000);
      const ids = [...new Set((cs ?? []).map((c) => c.company_id as string))];
      let done = 0;
      for (const cid of ids.slice(0, 20)) {
        const r = await xray(admin, cid, days);
        if ("report" in r) done++;
      }
      return json({ ok: true, refreshed: done, companies: ids.length });
    }
    if (body?.company_id) {
      const r = await xray(admin, body.company_id, days);
      return json({ ok: true, ...r });
    }
    return json({ ok: false, error: "company_id or all_companies required" }, 400);
  }

  // Dashboard path: company admin (own company) or super-admin (any).
  const u = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
  const { data: ud } = await u.auth.getUser();
  if (!ud?.user) return json({ ok: false, error: "Unauthorized" }, 401);
  const [{ data: me }, { data: pa }] = await Promise.all([
    admin.from("profiles").select("role, company_id").eq("id", ud.user.id).maybeSingle(),
    admin.from("platform_admins").select("user_id").eq("user_id", ud.user.id).maybeSingle(),
  ]);
  const isSuper = !!pa;
  if (me?.role !== "admin" && !isSuper) return json({ ok: false, error: "Managers only" }, 403);
  const companyId = isSuper && body?.company_id ? body.company_id : me?.company_id;
  if (!companyId) return json({ ok: false, error: "No company" }, 400);

  const r = await xray(admin, companyId, days);
  return json({ ok: true, company_id: companyId, ...r });
});
