// Meta Conversions API forwarder — the "close the loop" half of Meta lead ads.
// When a lead that CAME FROM a Meta Instant Form crosses a qualifying funnel
// stage, we send Meta a conversion event keyed on the original lead_id, so its
// optimization learns which leads actually convert and finds more like them.
//
// Body: { contact_id, status?, event_name? }
//   - status     → mapped to a Meta event_name via the company's map (or defaults)
//   - event_name → send this event explicitly (overrides the map; used for tests)
// Auth: service role only (the DB trigger calls it; also callable for a test send).
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
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GRAPH = "https://graph.facebook.com/v21.0";

// Which funnel stage counts as which Meta event, when the company hasn't set
// its own map. These are the milestones worth optimizing on.
const DEFAULT_MAP: Record<string, string> = {
  interested: "QualifiedLead",
  site_visit: "Schedule",
  negotiation: "InitiateCheckout",
  token_paid: "Purchase",
  booked: "Purchase",
};

async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
// Meta wants phone in digits-only E.164 (with country code, no +/spaces) before hashing.
function normPhone(p: string): string {
  return (p || "").replace(/[^0-9]/g, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (bearer !== SERVICE) return json({ ok: false, error: "Unauthorized" }, 401);

  const { contact_id, status, event_name: forced } = await req.json().catch(() => ({}));
  if (!contact_id) return json({ ok: false, error: "missing contact_id" }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE);

  const { data: contact } = await admin.from("contacts")
    .select("id, company_id, name, phone, email, status, lead_source, lead_source_id")
    .eq("id", contact_id).maybeSingle();
  if (!contact) return json({ ok: false, error: "contact not found" }, 404);
  if (contact.lead_source !== "facebook" || !contact.lead_source_id) {
    return json({ ok: true, skipped: "not a Meta lead" });
  }

  // Company CAPI config (dataset + decrypted token + optional map).
  const { data: cfg } = await admin.rpc("get_facebook_capi", { p_company: contact.company_id });
  if (!cfg || !cfg.enabled || !cfg.dataset_id || !cfg.token) {
    return json({ ok: true, skipped: "CAPI not configured/enabled" });
  }

  const map: Record<string, string> = { ...DEFAULT_MAP, ...(cfg.event_map ?? {}) };
  const eventName: string | undefined = forced ?? map[status ?? contact.status];
  if (!eventName) return json({ ok: true, skipped: `no event for stage '${status ?? contact.status}'` });

  // De-dup: one signal of each kind per lead. If the row already exists, we've sent it.
  const { error: dupErr } = await admin.from("capi_events").insert({
    company_id: contact.company_id, contact_id: contact.id,
    event_name: eventName, meta_lead_id: String(contact.lead_source_id),
  });
  if (dupErr) {
    if (dupErr.code === "23505") return json({ ok: true, skipped: "already sent", event_name: eventName });
    return json({ ok: false, error: dupErr.message }, 500);
  }

  // Build the CAPI payload. lead_id ties the event straight to the ad/form;
  // hashed phone/email are sent as an extra matching signal.
  const user_data: Record<string, unknown> = {};
  const leadIdNum = Number(contact.lead_source_id);
  if (Number.isFinite(leadIdNum) && String(leadIdNum) === String(contact.lead_source_id)) {
    user_data.lead_id = leadIdNum;
  }
  if (contact.phone) user_data.ph = [await sha256(normPhone(contact.phone))];
  if (contact.email) user_data.em = [await sha256(contact.email.trim().toLowerCase())];

  const payload = {
    data: [{
      event_name: eventName,
      event_time: Math.floor(Date.now() / 1000),
      action_source: "system_generated",
      event_id: `${contact.id}:${eventName}`,
      user_data,
      custom_data: { lead_event_source: "CRM", event_source: "call_pro_ai" },
    }],
  };

  let ok = false, responseText = "";
  try {
    const res = await fetch(`${GRAPH}/${cfg.dataset_id}/events?access_token=${encodeURIComponent(cfg.token)}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    responseText = (await res.text()).slice(0, 500);
    ok = res.ok;
  } catch (e) {
    responseText = String(e).slice(0, 500);
  }

  await admin.from("capi_events")
    .update({ ok, response: responseText })
    .eq("contact_id", contact.id).eq("event_name", eventName);

  return json({ ok, event_name: eventName, sent_to: cfg.dataset_id, response: responseText });
});
