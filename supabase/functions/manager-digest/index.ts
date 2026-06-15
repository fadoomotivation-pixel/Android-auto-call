// Manager AI coach: generates a daily digest per company from the day's stats
// (get_company_daily_stats) + Groq. Two entry modes:
//   - Admin on-demand: JWT in Authorization -> generates for the admin's company.
//   - Cron (all companies): header x-cron-secret == CRON_SECRET -> generates for
//     every company with activity on the target day.
// Body: { date?: "YYYY-MM-DD", company_id?: uuid (super-admin only) }
// Secrets: GROQ_API_KEY, CRON_SECRET (for the scheduled run).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(o: unknown, s = 200) {
  return new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
}
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GROQ = Deno.env.get("GROQ_API_KEY") ?? "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

// Today's calendar date in IST (the team's timezone).
function istDate(offsetDays = 0): string {
  const d = new Date(Date.now() + 5.5 * 3600_000 + offsetDays * 86400_000);
  return d.toISOString().slice(0, 10);
}

const SYSTEM_PROMPT =
  "You are an AI sales coach reporting to the manager of a real-estate " +
  "telecalling team. Given the day's stats JSON, write a short daily digest in " +
  "clear English (~120-160 words) with these sections: " +
  "1) Headline (one line), 2) Wins, 3) Watch-outs (name reps who were absent or " +
  "made few calls; flag idle leads), 4) Tomorrow's focus. Be specific with the " +
  "numbers and rep names. Honest but encouraging. Plain text, no markdown.";

async function generateForCompany(admin: SupabaseClient, companyId: string, date: string) {
  const { data: stats, error } = await admin.rpc("get_company_daily_stats", { p_company: companyId, p_date: date });
  if (error) throw new Error(`stats: ${error.message}`);

  const ch = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST", headers: { Authorization: `Bearer ${GROQ}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile", temperature: 0.4,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Stats for ${date}:\n${JSON.stringify(stats)}` },
      ],
    }),
  });
  const chj = await ch.json();
  const content: string = chj.choices?.[0]?.message?.content ?? "";
  if (!content.trim()) throw new Error(`digest empty: ${JSON.stringify(chj).slice(0, 200)}`);

  await admin.from("manager_digests").upsert(
    { company_id: companyId, digest_date: date, content, stats },
    { onConflict: "company_id,digest_date" },
  );
  return { content, stats };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!GROQ) return json({ ok: false, error: "GROQ_API_KEY is not configured." }, 500);

  const body = await req.json().catch(() => ({}));
  const admin = createClient(SUPABASE_URL, SERVICE);

  // --- Cron mode: generate for every active company ---
  // Triggered either by a matching x-cron-secret, or by the nightly pg_cron job
  // which authenticates with the project's service-role key (already trusted).
  const cronHeader = req.headers.get("x-cron-secret") ?? "";
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const isCron = (CRON_SECRET && cronHeader === CRON_SECRET) || (!!bearer && bearer === SERVICE);
  if (isCron) {
    const date = body.date ?? istDate(0); // run after the day's close for "today" IST
    const { data: companies } = await admin.from("companies").select("id");
    let generated = 0;
    for (const c of companies ?? []) {
      try {
        const { data: stats } = await admin.rpc("get_company_daily_stats", { p_company: c.id, p_date: date });
        const s = stats as Record<string, number> | null;
        if (!s || ((s.calls_total ?? 0) === 0 && (s.new_leads ?? 0) === 0)) continue;
        await generateForCompany(admin, c.id, date);
        generated++;
      } catch (_) { /* skip a company that fails, keep going */ }
    }
    return json({ ok: true, generated });
  }

  // --- Admin on-demand mode ---
  const auth = req.headers.get("Authorization") ?? "";
  const u = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
  const { data: ud } = await u.auth.getUser();
  if (!ud?.user) return json({ ok: false, error: "Unauthorized" }, 401);

  const { data: prof } = await u.from("profiles").select("role, company_id").eq("id", ud.user.id).maybeSingle();
  const { data: pa } = await u.from("platform_admins").select("user_id").eq("user_id", ud.user.id).maybeSingle();
  const isSuper = !!pa;
  if (prof?.role !== "admin" && !isSuper) return json({ ok: false, error: "Admins only." }, 403);

  const companyId = isSuper && body.company_id ? body.company_id : prof?.company_id;
  if (!companyId) return json({ ok: false, error: "No company to report on." }, 400);

  const date = body.date ?? istDate(0);
  try {
    const res = await generateForCompany(admin, companyId, date);
    return json({ ok: true, date, ...res });
  } catch (e) {
    return json({ ok: false, error: String(e) });
  }
});
