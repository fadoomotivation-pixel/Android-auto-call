// WhatsApp connection check — tells a non-technical person, in plain words,
// whether their setup actually works and what to fix if it doesn't.
//
// The setup form asks for a phone number ID, a WABA ID, a permanent token and a
// verify token. Get one character wrong and nothing happens — no error, just
// silence — so people give up. This calls Meta with the saved credentials and
// turns the reply into one sentence anyone can act on.
//
// Body: { company_id }            → check that one company
//        { mode: "all" }          → super-admin: status of EVERY company at once
// Auth: company admin (own company) or platform super-admin (any / all).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GRAPH = "https://graph.facebook.com/v21.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

interface Check {
  company_id: string;
  company_name?: string | null;
  ok: boolean;
  state: "connected" | "not_set_up" | "token_missing" | "token_expired" | "wrong_id" | "inactive" | "error";
  headline: string;   // one sentence a non-technical owner can act on
  fix?: string;       // what to do next, in plain words
  number?: string | null;
  name?: string | null;
  quality?: string | null;
}

/** Check one company's saved WhatsApp credentials against Meta. */
async function check(admin: ReturnType<typeof createClient>, companyId: string, companyName?: string | null): Promise<Check> {
  const base = { company_id: companyId, company_name: companyName ?? null };

  const { data: integ } = await admin.from("whatsapp_integrations")
    .select("phone_number_id, display_number, active").eq("company_id", companyId).maybeSingle();

  if (!integ?.phone_number_id) {
    return { ...base, ok: false, state: "not_set_up",
      headline: "WhatsApp is not set up yet.",
      fix: "Open the setup below and paste the Phone number ID and permanent token from your Meta WhatsApp account." };
  }

  const { data: token } = await admin.rpc("get_whatsapp_token", { p_company: companyId });
  if (!token) {
    return { ...base, ok: false, state: "token_missing",
      headline: "The access token is missing.",
      fix: "Paste the permanent token again in the setup below and save — the number is saved, only the token is missing." };
  }

  let r: Record<string, unknown> | null = null;
  try {
    r = await fetch(
      `${GRAPH}/${integ.phone_number_id}?fields=display_phone_number,verified_name,quality_rating&access_token=${encodeURIComponent(String(token))}`,
    ).then((x) => x.json());
  } catch (_e) {
    return { ...base, ok: false, state: "error", headline: "Couldn't reach WhatsApp just now.", fix: "Try the check again in a minute." };
  }

  const err = (r?.error ?? null) as { message?: string; code?: number; type?: string } | null;
  if (err) {
    const msg = String(err.message ?? "");
    // Session/token problems (code 190) vs a wrong id (100 / unknown path).
    if (err.code === 190 || /expired|session|invalid.*token/i.test(msg)) {
      return { ...base, ok: false, state: "token_expired",
        headline: "The token has expired or was revoked.",
        fix: "Create a fresh PERMANENT token in Meta Business Settings (System user → Generate token) and paste it below." };
    }
    if (err.code === 100 || /does not exist|unsupported|cannot be loaded/i.test(msg)) {
      return { ...base, ok: false, state: "wrong_id",
        headline: "That Phone number ID doesn't match this token.",
        fix: "In Meta → WhatsApp → API setup, copy the 'Phone number ID' (a long number, NOT the phone number itself) and paste it below." };
    }
    return { ...base, ok: false, state: "error", headline: `WhatsApp replied: ${msg || "unknown error"}`, fix: "Re-copy the ID and token from Meta and save again." };
  }

  const number = (r?.display_phone_number as string) ?? integ.display_number ?? null;
  const name = (r?.verified_name as string) ?? null;
  const quality = (r?.quality_rating as string) ?? null;

  if (integ.active === false) {
    return { ...base, ok: false, state: "inactive", number, name, quality,
      headline: `Connected to ${number ?? "your number"}, but switched off.`,
      fix: "Turn the 'Active' switch on in the setup below to start sending." };
  }

  return { ...base, ok: true, state: "connected", number, name, quality,
    headline: `Working — connected to ${name ? `${name} (${number})` : number}.`,
    fix: quality && quality !== "GREEN" ? `Meta rates this number's quality ${quality} — send fewer cold messages to protect it.` : undefined };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const auth = req.headers.get("Authorization") ?? "";
  const u = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
  const { data: ud } = await u.auth.getUser();
  if (!ud?.user) return json({ ok: false, error: "Unauthorized" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE);
  const [{ data: prof }, { data: pa }] = await Promise.all([
    admin.from("profiles").select("role, company_id").eq("id", ud.user.id).maybeSingle(),
    admin.from("platform_admins").select("user_id").eq("user_id", ud.user.id).maybeSingle(),
  ]);
  const isSuper = !!pa;
  if (prof?.role !== "admin" && !isSuper) return json({ ok: false, error: "Admins only." }, 403);

  const body = await req.json().catch(() => ({} as Record<string, unknown>));

  // Super-admin overview: every company at a glance, so a long list never hides
  // the one that is quietly broken.
  if (body.mode === "all") {
    if (!isSuper) return json({ ok: false, error: "Super-admin only." }, 403);
    const { data: cos } = await admin.from("companies").select("id, name").order("name");
    const checks: Check[] = [];
    for (const c of (cos ?? []).slice(0, 40)) {
      checks.push(await check(admin, c.id as string, c.name as string));
    }
    const connected = checks.filter((c) => c.ok).length;
    return json({ ok: true, checks, total: checks.length, connected, broken: checks.length - connected });
  }

  const companyId = typeof body.company_id === "string" ? body.company_id : (prof?.company_id as string | undefined);
  if (!companyId) return json({ ok: false, error: "No company." }, 400);
  // A company admin may only check their own company.
  if (!isSuper && companyId !== prof?.company_id) return json({ ok: false, error: "Not your company." }, 403);

  return json({ ok: true, check: await check(admin, companyId) });
});
