// Everything about the founder-notification pipe: configure it, look at it, and
// work its queue.
//
// One function rather than three because they share the same two ideas — which
// provider a company is on, and the shared secret that must never reach a
// browser. The admin page therefore never talks to the Baileys worker directly:
// it asks here, and the secret is fetched server-side and used server-side. A
// QR endpoint the browser could call with a bearer would be a bearer sitting in
// the browser.
//
// Actions (POST { action, ... }):
//   save      — where the worker lives + its secret, and switch the provider
//   provider  — switch provider without touching the worker settings
//   status    — what the worker says about itself
//   qr        — the current QR, while WhatsApp is offering one
//   reconnect — force a fresh connection attempt
//   drain     — cron only: retry everything the outbox is holding
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { BaileysProvider } from "../_shared/wa-provider.ts";
import { drainOutbox } from "../_shared/notify.ts";

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

/** Build a worker client for a company, using the secret only on this side. */
async function workerFor(
  admin: ReturnType<typeof createClient>, companyId: string,
): Promise<BaileysProvider | { error: string }> {
  const { data: b } = await admin.from("whatsapp_baileys")
    .select("base_url").eq("company_id", companyId).maybeSingle();
  if (!b?.base_url) return { error: "No Baileys worker is set up for this company yet." };
  const { data: secret } = await admin.rpc("get_baileys_secret", { p_company: companyId });
  if (!secret) return { error: "The worker's secret is missing. Re-enter it and save." };
  return new BaileysProvider(String(b.base_url), String(secret));
}

/** Cache what the worker said, so the WhatsApp list can show state without a round trip per row. */
async function cacheStatus(
  admin: ReturnType<typeof createClient>, companyId: string,
  s: { status: string; number: string | null; last_seen: string | null; error: string | null },
) {
  await admin.from("whatsapp_baileys").update({
    status: s.status,
    wa_number: s.number,
    last_seen_at: s.last_seen,
    last_error: s.error,
    updated_at: new Date().toISOString(),
  }).eq("company_id", companyId);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const admin = createClient(SUPABASE_URL, SERVICE);
  const body = await req.json().catch(() => ({}));
  const action = String(body?.action ?? "");

  const auth = req.headers.get("Authorization") ?? "";
  const bearer = auth.replace(/^Bearer\s+/i, "").trim();
  const isCron = !!bearer && bearer === SERVICE;

  // ---- Cron: work the queue for every company ----
  if (action === "drain") {
    if (!isCron) return json({ ok: false, error: "Not allowed" }, 403);
    const r = await drainOutbox(admin);
    return json({ ok: true, ...r });
  }

  // ---- Everything else is an admin acting on a company ----
  const u = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
  const { data: ud } = await u.auth.getUser();
  if (!ud?.user) return json({ ok: false, error: "Unauthorized" }, 401);

  const [{ data: me }, { data: pa }] = await Promise.all([
    admin.from("profiles").select("role, company_id").eq("id", ud.user.id).maybeSingle(),
    admin.from("platform_admins").select("user_id").eq("user_id", ud.user.id).maybeSingle(),
  ]);
  const isSuper = !!pa;
  if (me?.role !== "admin" && !isSuper) return json({ ok: false, error: "Admins only" }, 403);

  // A company admin acts on their own company and nothing else. The super admin
  // names the company, because the super admin is the platform's owner and every
  // page of theirs is cross-company by design.
  const companyId = isSuper && body?.company_id ? String(body.company_id) : String(me?.company_id ?? "");
  if (!companyId) return json({ ok: false, error: "No company." }, 400);
  if (!isSuper && body?.company_id && String(body.company_id) !== String(me?.company_id)) {
    return json({ ok: false, error: "Not your company." }, 403);
  }

  if (action === "save") {
    const baseUrl = String(body?.base_url ?? "").trim().replace(/\/+$/, "");
    const secret = String(body?.secret ?? "").trim();
    if (!/^https?:\/\//i.test(baseUrl)) {
      return json({ ok: false, error: "Give the worker's full address, starting with https://" }, 400);
    }
    await admin.from("whatsapp_baileys")
      .upsert({ company_id: companyId, base_url: baseUrl, updated_at: new Date().toISOString() }, { onConflict: "company_id" });
    // Through the USER's client on purpose: set_baileys_secret guards itself on
    // is_admin()/is_super_admin(), and those only mean anything under the
    // caller's own JWT. Called as the service role the guard would pass for
    // everyone, which is not a guard.
    if (secret) {
      const { error } = await u.rpc("set_baileys_secret", { p_company: companyId, p_secret: secret });
      if (error) return json({ ok: false, error: error.message }, 400);
    }
    return json({ ok: true });
  }

  if (action === "provider") {
    const provider = body?.provider === "baileys" ? "baileys" : "meta";
    const { data: existing } = await admin.from("whatsapp_integrations")
      .select("company_id").eq("company_id", companyId).maybeSingle();
    if (existing) {
      await admin.from("whatsapp_integrations").update({ provider }).eq("company_id", companyId);
    } else {
      // A company can be on Baileys with no Cloud API setup at all, so the row
      // has to be creatable from the provider choice alone.
      await admin.from("whatsapp_integrations").insert({
        company_id: companyId,
        provider,
        verify_token: crypto.randomUUID().replace(/-/g, ""),
        active: true,
      });
    }
    return json({ ok: true, provider });
  }

  if (action === "status" || action === "qr" || action === "reconnect") {
    const w = await workerFor(admin, companyId);
    if ("error" in w) return json({ ok: false, error: w.error }, 400);

    if (action === "reconnect") {
      await w.connect();
      return json({ ok: true, status: "connecting" });
    }
    if (action === "qr") {
      const q = await w.qr().catch(() => ({ status: "disconnected", qr: null }));
      return json({ ok: true, ...q });
    }
    const s = await w.status().catch(() => ({
      status: "disconnected", number: null, last_seen: null,
      error: "Could not reach the worker. Check the URL and that the service is running.",
    }));
    await cacheStatus(admin, companyId, s);
    return json({ ok: true, ...s });
  }

  return json({ ok: false, error: `Unknown action: ${action}` }, 400);
});
