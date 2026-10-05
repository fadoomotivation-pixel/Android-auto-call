// Meta Conversions API forwarder — the "close the loop" half of Meta lead ads.
// When a lead that CAME FROM a Meta Instant Form crosses a qualifying funnel
// stage, we send Meta a conversion event keyed on the original lead_id, so its
// optimization learns which leads actually convert and finds more like them.
//
// The database trigger (migration 0053) calls this only for
// lead_source = 'facebook' with a lead id, and only when status changes.
// This function still accepts a hashed phone when something calls it directly
// (the import-lead path). It does not widen that trigger.
//
// Body: { contact_id, status?, event_name? }
//   - status     → mapped to a Meta event_name via the company's map (or defaults)
//   - event_name → send this event explicitly (overrides the map; used for tests)
//   - mode:"retry" → re-send rows whose last attempt failed. Optional company_id.
// Auth: service role only (the DB trigger calls it; facebook-manage retries).
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
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GRAPH = "https://graph.facebook.com/v21.0";

// Stop hammering Meta after this many failed posts for the same lead+event.
const MAX_ATTEMPTS = 5;

// token_amount is rupees. The rest of this CRM (pulse, voice notes, the
// founder's report) treats it as INR and never as a plot price. Measured
// 2026-10-05: the column is null on every lead, and no Purchase has ever
// been sent. When a token is saved later, this is the number we send.
const CURRENCY = "INR";

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

type ValueSource = "token_amount" | "none" | "not_purchase";

/** Purchase value only when a token was actually recorded. Budget is not money paid. */
export function purchaseValue(eventName: string, tokenAmount: unknown): {
  value: number | null;
  currency: string | null;
  value_source: ValueSource;
} {
  if (eventName !== "Purchase") return { value: null, currency: null, value_source: "not_purchase" };
  const n = Number(tokenAmount);
  if (!Number.isFinite(n) || n <= 0) return { value: null, currency: null, value_source: "none" };
  return { value: Math.round(n * 100) / 100, currency: CURRENCY, value_source: "token_amount" };
}

type Log = { attempts: number; stopped: boolean };

/** Read our own envelope. A raw Meta body counts as one earlier attempt. */
function parseLog(response: string | null | undefined): Log {
  if (!response) return { attempts: 0, stopped: false };
  try {
    const j = JSON.parse(response) as { attempts?: unknown; value_source?: unknown; stopped?: unknown };
    if (typeof j.attempts === "number" && typeof j.value_source === "string") {
      return { attempts: j.attempts, stopped: j.stopped === true };
    }
  } catch { /* a plain Meta body */ }
  return { attempts: 1, stopped: false };
}

function envelope(o: {
  attempts: number;
  value: number | null;
  currency: string | null;
  value_source: ValueSource;
  meta: string;
  error: string | null;
  stopped?: boolean;
}): string {
  return JSON.stringify({
    attempts: o.attempts,
    value: o.value,
    currency: o.currency,
    value_source: o.value_source,
    meta: o.meta.slice(0, 400),
    error: o.error,
    stopped: o.stopped === true,
  });
}

type SendResult = {
  ok: boolean;
  skipped?: string;
  event_name?: string;
  error?: string;
  value?: number | null;
  currency?: string | null;
  value_source?: ValueSource;
  attempts?: number;
};

async function sendOne(
  admin: SupabaseClient,
  contactId: string,
  status: string | undefined,
  forced: string | undefined,
): Promise<SendResult> {
  const { data: contact } = await admin.from("contacts")
    .select("id, company_id, name, phone, email, status, lead_source, lead_source_id, token_amount")
    .eq("id", contactId).maybeSingle();
  if (!contact) return { ok: false, error: "contact not found" };
  // A conversion event needs at least one identifier Meta can match on: the
  // original Meta lead_id (best, when the lead came through the webhook) OR a
  // hashed phone/email. Import leads have no lead_id but still match on phone —
  // Meta credits only the ones whose phone/email actually saw the ad and ignores
  // the rest, so this is safe and lets CSV-imported ad leads report conversions.
  if (!contact.lead_source_id && !contact.phone && !contact.email) {
    return { ok: true, skipped: "no phone/email/lead_id to match on" };
  }

  const { data: cfg } = await admin.rpc("get_facebook_capi", { p_company: contact.company_id });
  if (!cfg || !cfg.enabled || !cfg.dataset_id || !cfg.token) {
    return { ok: true, skipped: "CAPI not configured/enabled" };
  }

  const map: Record<string, string> = { ...DEFAULT_MAP, ...(cfg.event_map ?? {}) };
  const eventName: string | undefined = forced ?? map[status ?? contact.status];
  if (!eventName) return { ok: true, skipped: `no event for stage '${status ?? contact.status}'` };

  const money = purchaseValue(eventName, contact.token_amount);

  // De-dup: one signal of each kind per lead. A row with ok=true has been sent.
  // A row with ok=false is a failed post and must be tried again — treating the
  // unique key as "already sent" is how a failure stayed a failure forever.
  let prior = 0;
  const { error: dupErr } = await admin.from("capi_events").insert({
    company_id: contact.company_id, contact_id: contact.id,
    event_name: eventName, meta_lead_id: contact.lead_source_id ? String(contact.lead_source_id) : null,
  });
  if (dupErr) {
    if (dupErr.code !== "23505") return { ok: false, error: dupErr.message };
    const { data: row } = await admin.from("capi_events")
      .select("ok, response")
      .eq("contact_id", contact.id).eq("event_name", eventName).maybeSingle();
    if (row?.ok === true) return { ok: true, skipped: "already sent", event_name: eventName };
    const logged = parseLog(row?.response as string | null);
    if (logged.stopped || logged.attempts >= MAX_ATTEMPTS) {
      return {
        ok: false, skipped: "stopped after failed attempts",
        event_name: eventName, attempts: logged.attempts,
      };
    }
    prior = logged.attempts;
  }

  const user_data: Record<string, unknown> = {};
  const leadIdNum = Number(contact.lead_source_id);
  if (Number.isFinite(leadIdNum) && String(leadIdNum) === String(contact.lead_source_id)) {
    user_data.lead_id = leadIdNum;
  }
  if (contact.phone) user_data.ph = [await sha256(normPhone(contact.phone))];
  if (contact.email) user_data.em = [await sha256(contact.email.trim().toLowerCase())];

  const custom_data: Record<string, unknown> = {
    lead_event_source: "CRM",
    event_source: "call_pro_ai",
  };
  // Both or neither. Meta rejects a value with no currency. We do not invent
  // a plot price, a yield, or a guaranteed return — housing ads cannot claim those.
  if (money.value != null && money.currency) {
    custom_data.value = money.value;
    custom_data.currency = money.currency;
  }

  const payload = {
    data: [{
      event_name: eventName,
      event_time: Math.floor(Date.now() / 1000),
      action_source: "system_generated",
      event_id: `${contact.id}:${eventName}`,
      user_data,
      custom_data,
    }],
  };

  const attempts = prior + 1;
  let ok = false;
  let responseText = "";
  let err: string | null = null;
  try {
    const res = await fetch(`${GRAPH}/${cfg.dataset_id}/events?access_token=${encodeURIComponent(cfg.token)}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    responseText = (await res.text()).slice(0, 500);
    ok = res.ok;
    if (!ok) err = `Meta rejected the event (${res.status})`;
  } catch (e) {
    responseText = String(e).slice(0, 500);
    err = "Could not reach Meta";
  }

  const stopped = !ok && attempts >= MAX_ATTEMPTS;
  await admin.from("capi_events")
    .update({
      ok,
      response: envelope({
        attempts, value: money.value, currency: money.currency,
        value_source: money.value_source, meta: responseText, error: err, stopped,
      }),
    })
    .eq("contact_id", contact.id).eq("event_name", eventName);

  return {
    ok, event_name: eventName, attempts,
    value: money.value, currency: money.currency, value_source: money.value_source,
    error: err ?? undefined,
  };
}

async function retryFailed(admin: SupabaseClient, companyId: string | null): Promise<Response> {
  let q = admin.from("capi_events")
    .select("contact_id, event_name, response")
    .or("ok.eq.false,ok.is.null")
    .order("created_at", { ascending: true })
    .limit(20);
  if (companyId) q = q.eq("company_id", companyId);
  const { data, error } = await q;
  if (error) return json({ ok: false, error: error.message }, 500);

  let sent = 0, still_failed = 0, skipped_cap = 0, tried = 0;
  for (const row of data ?? []) {
    const logged = parseLog(row.response as string | null);
    if (logged.stopped || logged.attempts >= MAX_ATTEMPTS) {
      skipped_cap++;
      continue;
    }
    tried++;
    const result = await sendOne(admin, String(row.contact_id), undefined, String(row.event_name));
    if (result.ok && !result.skipped) sent++;
    else if (result.skipped === "stopped after failed attempts" || result.skipped === "already sent") skipped_cap++;
    else still_failed++;
  }
  return json({
    ok: true,
    tried, sent, still_failed, skipped_cap,
    note: tried === 0 ? "No failed events to retry." : undefined,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (bearer !== SERVICE) return json({ ok: false, error: "Unauthorized" }, 401);

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const admin = createClient(SUPABASE_URL, SERVICE);

  if (body.mode === "retry") {
    const company = typeof body.company_id === "string" && body.company_id ? body.company_id : null;
    return retryFailed(admin, company);
  }

  const contact_id = typeof body.contact_id === "string" ? body.contact_id : "";
  if (!contact_id) return json({ ok: false, error: "missing contact_id" }, 400);
  const status = typeof body.status === "string" ? body.status : undefined;
  const forced = typeof body.event_name === "string" ? body.event_name : undefined;
  const result = await sendOne(admin, contact_id, status, forced);
  const statusCode = result.error === "contact not found" ? 404 : result.error && !result.event_name ? 500 : 200;
  return json(result, statusCode);
});
