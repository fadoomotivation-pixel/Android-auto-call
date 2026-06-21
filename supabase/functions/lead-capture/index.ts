// Generic inbound lead-capture webhook (public, token-gated). Any external source
// POSTs a lead here and it lands in the CRM, assigned to a rep, optionally with an
// instant WhatsApp welcome template.
//
//   POST /functions/v1/lead-capture?token=<capture_token>
//   body: { name?, phone, email?, source?, external_id? }
//   (token may also be sent as the x-capture-token header)
//
// verify_jwt must be OFF (external callers can't send a Supabase JWT).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-capture-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(o: unknown, s = 200) {
  return new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
}
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GRAPH = "https://graph.facebook.com/v21.0";
const digits = (s: string) => (s ?? "").replace(/\D/g, "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  const url = new URL(req.url);
  const token = url.searchParams.get("token") || req.headers.get("x-capture-token") || "";
  if (!token) return json({ ok: false, error: "missing capture token" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE);

  const { data: cfg } = await admin.from("lead_capture_config")
    .select("company_id, default_salesperson_id, welcome_enabled, welcome_template, welcome_template_lang, active")
    .eq("capture_token", token).maybeSingle();
  if (!cfg || !cfg.active) return json({ ok: false, error: "invalid or inactive token" }, 401);

  const body = await req.json().catch(() => ({}));
  const phone = digits(body.phone ?? "");
  if (!phone) return json({ ok: false, error: "phone is required" }, 400);
  const name = (body.name ?? "").toString().trim() || null;
  const email = (body.email ?? "").toString().trim() || null;
  const source = (body.source ?? "webhook").toString().slice(0, 60);
  const externalId = body.external_id ? String(body.external_id) : null;

  // Idempotency: skip if we've already captured this lead (by external id, else phone).
  let existing = null as { id: string } | null;
  if (externalId) {
    const { data } = await admin.from("contacts").select("id")
      .eq("company_id", cfg.company_id).eq("lead_source_id", externalId).maybeSingle();
    existing = data;
  }
  if (!existing) {
    const { data } = await admin.from("contacts").select("id")
      .eq("company_id", cfg.company_id).eq("phone", phone).limit(1).maybeSingle();
    existing = data;
  }
  if (existing) {
    // A returning buyer (re-submitting a form / coming back via a tracked link)
    // is a re-engagement — wake the lead if it had gone cold.
    await admin.rpc("reactivate_lead", { p_contact_id: existing.id, p_signal: "web" });
    return json({ ok: true, contact_id: existing.id, deduped: true, reactivated: true });
  }

  const { data: inserted, error } = await admin.from("contacts").insert({
    company_id: cfg.company_id,
    salesperson_id: cfg.default_salesperson_id ?? null,
    name, phone, email,
    status: "new",
    lead_source: source,
    lead_source_id: externalId,
  }).select("id").single();
  if (error) return json({ ok: false, error: error.message }, 200);

  // Optional: instant WhatsApp welcome (business-initiated → must be an approved template).
  let welcomeSent = false;
  if (cfg.welcome_enabled && cfg.welcome_template) {
    try {
      const { data: integ } = await admin.from("whatsapp_integrations")
        .select("phone_number_id, active").eq("company_id", cfg.company_id).maybeSingle();
      const { data: accessToken } = await admin.rpc("get_whatsapp_token", { p_company: cfg.company_id });
      if (integ?.active && accessToken) {
        let to = phone;
        if (to.length === 10) to = "91" + to;
        const resp = await fetch(`${GRAPH}/${integ.phone_number_id}/messages`, {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            messaging_product: "whatsapp", to, type: "template",
            template: { name: cfg.welcome_template, language: { code: cfg.welcome_template_lang || "en" } },
          }),
        });
        const wd = await resp.json();
        if (resp.ok) {
          welcomeSent = true;
          await admin.from("whatsapp_messages").upsert({
            company_id: cfg.company_id,
            contact_id: inserted.id,
            salesperson_id: cfg.default_salesperson_id ?? null,
            direction: "out",
            wa_message_id: wd.messages?.[0]?.id ?? null,
            counterparty: to,
            body: `[template] ${cfg.welcome_template}`,
            msg_type: "template",
            template_name: cfg.welcome_template,
            status: "sent",
          }, { onConflict: "wa_message_id", ignoreDuplicates: true });
        }
      }
    } catch (_) { /* welcome is best-effort; never fail the capture */ }
  }

  return json({ ok: true, contact_id: inserted.id, welcome_sent: welcomeSent });
});
