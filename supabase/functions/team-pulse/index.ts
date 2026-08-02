// Team Pulse — "Aaj kiski pipeline me kya hua", built for the company owner /
// super-admin to see (and forward) at a glance what each telecaller did today.
//
// The gathering and the wording both live in ../_shared/pulse.ts, because the
// same report is also PUSHED to the founder's WhatsApp at 7pm by
// pulse-broadcast. This endpoint returns the data (for the dashboard) and the
// ready-to-send text (for sharing) from that one source, so what the founder
// reads on the page and what lands on their phone can never disagree.
//
// Body: { date?: "YYYY-MM-DD" (IST), company_id?: uuid (super-admin only) }
// Auth: company admin (JWT, scoped to own company) or super-admin (any/all).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { buildCompany, istDate, pulseText, repText } from "../_shared/pulse.ts";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const auth = req.headers.get("Authorization") ?? "";
  const admin = createClient(SUPABASE_URL, SERVICE);

  const u = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
  const { data: ud } = await u.auth.getUser();
  if (!ud?.user) return json({ ok: false, error: "Unauthorized" }, 401);
  const [{ data: me }, { data: pa }] = await Promise.all([
    admin.from("profiles").select("role, company_id").eq("id", ud.user.id).maybeSingle(),
    admin.from("platform_admins").select("user_id").eq("user_id", ud.user.id).maybeSingle(),
  ]);
  const isSuper = !!pa;
  if (me?.role !== "admin" && !isSuper) return json({ ok: false, error: "Managers only" }, 403);

  const body = await req.json().catch(() => ({}));
  const date = typeof body?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : istDate(0);

  let companyIds: string[];
  if (isSuper && body?.company_id) companyIds = [body.company_id];
  else if (isSuper) {
    const { data: cs } = await admin.from("companies").select("id");
    companyIds = (cs ?? []).map((c) => c.id);
  } else {
    if (!me?.company_id) return json({ ok: false, error: "No company" }, 400);
    companyIds = [me.company_id];
  }

  const nameById = new Map<string, string>();
  if (isSuper) {
    const { data: cs } = await admin.from("companies").select("id, name");
    for (const c of cs ?? []) nameById.set(c.id, c.name);
  }

  const companies = [];
  for (const cid of companyIds.slice(0, 20)) {
    const pulse = await buildCompany(admin, cid, date);
    const companyName = nameById.get(cid) ?? null;
    companies.push({
      company_id: cid,
      company_name: companyName,
      ...pulse,
      // Exactly what pulse-broadcast will send tonight — so "Copy report" and
      // the 7pm WhatsApp are the same words, not two attempts at them.
      text: pulseText(pulse, companyName),
      reps: pulse.reps.map((r) => ({ ...r, text: repText(r, pulse.date, companyName) })),
    });
  }

  return json({ ok: true, date, companies });
});
