// Sends a WhatsApp message through the company's Cloud API number and logs it
// (tagged with the sending rep + lead) so the super admin sees every outbound.
// Called by the app / admin. Body: { contact_id?, to?, text }
// Note: free-text only works inside the 24h customer service window; first-touch
// outreach needs an approved template (added later).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

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
const GRAPH = "https://graph.facebook.com/v21.0";

const digits = (s: string) => (s ?? "").replace(/\D/g, "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const auth = req.headers.get("Authorization") ?? "";
  const u = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
  const { data: ud } = await u.auth.getUser();
  if (!ud?.user) return json({ ok: false, error: "Unauthorized" }, 401);

  const { contact_id, to, text } = await req.json().catch(() => ({}));
  if (!text || !String(text).trim()) return json({ ok: false, error: "empty message" }, 400);

  const { data: prof } = await u.from("profiles").select("company_id").eq("id", ud.user.id).maybeSingle();
  const companyId = prof?.company_id;
  if (!companyId) return json({ ok: false, error: "No company." }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE);

  // Resolve the destination number + lead.
  let dest = to ? digits(to) : "";
  let resolvedContactId: string | null = contact_id ?? null;
  if (contact_id) {
    const { data: c } = await admin.from("contacts").select("phone").eq("id", contact_id).maybeSingle();
    if (c?.phone) dest = digits(c.phone);
  }
  if (!dest) return json({ ok: false, error: "no destination number" }, 400);
  // India default: prefix 91 for bare 10-digit numbers.
  if (dest.length === 10) dest = "91" + dest;

  const { data: integ } = await admin.from("whatsapp_integrations")
    .select("phone_number_id, active").eq("company_id", companyId).maybeSingle();
  if (!integ || !integ.active) return json({ ok: false, error: "WhatsApp is not connected for this company." }, 400);

  // Token lives in Vault, not the DB. Service-role-only RPC decrypts it.
  const { data: accessToken } = await admin.rpc("get_whatsapp_token", { p_company: companyId });
  if (!accessToken) return json({ ok: false, error: "WhatsApp token missing — reconnect in admin." }, 400);

  try {
    const resp = await fetch(`${GRAPH}/${integ.phone_number_id}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to: dest, type: "text", text: { body: String(text) } }),
    });
    const data = await resp.json();
    if (!resp.ok) return json({ ok: false, error: data?.error?.message ?? "send failed", detail: data }, 200);

    const waId = data.messages?.[0]?.id ?? null;
    await admin.from("whatsapp_messages").insert({
      company_id: companyId,
      contact_id: resolvedContactId,
      salesperson_id: ud.user.id,
      direction: "out",
      wa_message_id: waId,
      counterparty: dest,
      body: String(text),
      msg_type: "text",
      status: "sent",
    });
    return json({ ok: true, wa_message_id: waId });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 200);
  }
});
