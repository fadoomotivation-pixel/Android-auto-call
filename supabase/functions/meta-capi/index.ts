// Meta Conversions API forwarder — the "close the loop" half of Meta lead ads.
// When a lead that CAME FROM a Meta Instant Form crosses a qualifying funnel
// stage, we send Meta a conversion event keyed on the original lead_id, so its
// optimization learns which leads actually convert and finds more like them.
//
// The database trigger (migration 0053) calls this only for
// lead_source = 'facebook' with a lead id, and only when status changes.
// This function still accepts a hashed phone when something calls it directly
// (the import-lead path). It does not widen that trigger. A token amount saved
// later without a status change is picked up by Retry, which also reads
// Purchase rows that were marked sent with no amount.
//
// event_id stays `${contact_id}:${event_name}`.
// Dedupe assumption (Meta Conversions API, event_name + event_id): Meta treats
// that pair as one event and, within about 48 hours, keeps the first. The
// documented case is a browser event and a server event that share the id.
// Two server posts are not a value correction. A Purchase with no amount is
// therefore not posted and is not stored as ok=true — that would occupy the
// id and block a later amount. A row that was already ok=true with no amount
// (older sends) is posted once more under the same id, and the row records
// that Meta may still be counting the first event.
//
// Body: { contact_id, status?, event_name? }
//   - status     → mapped to a Meta event_name via the company's map (or defaults)
//   - event_name → send this event explicitly (overrides the map; used for tests)
//   - mode:"retry" → re-send rows whose last attempt failed, purchases still
//     waiting for an amount, and purchases marked sent with no amount.
//     Optional company_id.
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

// Stop hammering Meta after this many failed posts of the SAME payload.
const MAX_ATTEMPTS = 5;

// One click may post this many events. Each post is one Graph call. The loop
// also stops at RETRY_BUDGET_MS so the isolate is not cut off mid-write.
// The button stays disabled until this function returns, and a claim row
// stops a second send overlapping the first.
const RETRY_POSTS = 40;
const RETRY_BUDGET_MS = 45_000;

// A claim older than this is no longer in flight. The other send may take the row.
const CLAIM_TTL_MS = 90_000;

// token_amount is rupees. The rest of this CRM (pulse, voice notes, the
// founder's report) treats it as INR and never as a plot price. Measured
// 2026-10-05: the column is null on every lead, and no Purchase has ever
// been sent. When a token is saved later, this is the number we send.
const CURRENCY = "INR";

const WAITING = "purchase waiting for token amount";
const IN_FLIGHT = "another send is in flight";

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

function eventIdFor(contactId: string, eventName: string): string {
  return `${contactId}:${eventName}`;
}

type Log = {
  attempts: number;
  stopped: boolean;
  value: number | null;
  value_source: ValueSource | null;
  deferred: boolean;
  inflight: boolean;
  claimed_at: number | null;
};

/** Read our own envelope. A raw Meta body counts as one earlier attempt with no value. */
function parseLog(response: string | null | undefined): Log {
  const empty: Log = {
    attempts: 0, stopped: false, value: null, value_source: null,
    deferred: false, inflight: false, claimed_at: null,
  };
  if (!response) return empty;
  try {
    const j = JSON.parse(response) as Record<string, unknown>;
    if (j.inflight === true && typeof j.value_source !== "string") {
      return {
        ...empty,
        inflight: true,
        claimed_at: typeof j.claimed_at === "number" ? j.claimed_at : null,
        attempts: typeof j.attempts === "number" ? j.attempts : 0,
      };
    }
    if (typeof j.attempts === "number" && typeof j.value_source === "string") {
      return {
        attempts: j.attempts,
        stopped: j.stopped === true,
        value: typeof j.value === "number" ? j.value : null,
        value_source: j.value_source as ValueSource,
        deferred: j.deferred === true,
        inflight: j.inflight === true,
        claimed_at: typeof j.claimed_at === "number" ? j.claimed_at : null,
      };
    }
  } catch { /* a plain Meta body */ }
  return { ...empty, attempts: 1 };
}

function valuedPurchase(log: Log): boolean {
  return log.value_source === "token_amount" && (log.value ?? 0) > 0;
}

function inflightActive(response: string | null | undefined, now = Date.now()): boolean {
  const log = parseLog(response);
  if (!log.inflight || log.claimed_at == null) return false;
  return now - log.claimed_at < CLAIM_TTL_MS;
}

function envelope(o: {
  attempts: number;
  value: number | null;
  currency: string | null;
  value_source: ValueSource;
  meta: string;
  error: string | null;
  stopped?: boolean;
  deferred?: boolean;
  dedupe?: string | null;
}): string {
  return JSON.stringify({
    attempts: o.attempts,
    value: o.value,
    currency: o.currency,
    value_source: o.value_source,
    meta: o.meta.slice(0, 400),
    error: o.error,
    stopped: o.stopped === true,
    deferred: o.deferred === true,
    dedupe: o.dedupe ?? null,
  });
}

type EventRow = { ok: boolean | null; response: string | null };

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

async function readEvent(admin: SupabaseClient, contactId: string, eventName: string): Promise<EventRow | null> {
  const { data } = await admin.from("capi_events")
    .select("ok, response")
    .eq("contact_id", contactId).eq("event_name", eventName).maybeSingle();
  return data ?? null;
}

/**
 * Insert the row, or compare-and-swap `response` (and ok) so only one caller
 * holds it. The unique key on (contact_id, event_name) is what makes the
 * insert lose. The update matches the response we just read, so the second
 * caller gets zero rows and does not post.
 */
async function claimRow(
  admin: SupabaseClient,
  contact: { id: string; company_id: string; lead_source_id: string | null },
  eventName: string,
  existing: EventRow | null,
  priorAttempts: number,
): Promise<{ owned: true; claim: string } | { owned: false; reason: "inflight" | "lost" | "error"; error?: string }> {
  const claim = JSON.stringify({
    inflight: true,
    claimed_at: Date.now(),
    attempts: priorAttempts,
  });
  const metaLeadId = contact.lead_source_id ? String(contact.lead_source_id) : null;

  if (!existing) {
    const { error: insErr } = await admin.from("capi_events").insert({
      company_id: contact.company_id,
      contact_id: contact.id,
      event_name: eventName,
      meta_lead_id: metaLeadId,
      ok: null,
      response: claim,
    });
    if (!insErr) return { owned: true, claim };
    if (insErr.code !== "23505") return { owned: false, reason: "error", error: insErr.message };
    existing = await readEvent(admin, contact.id, eventName);
    if (!existing) return { owned: false, reason: "lost" };
  }

  if (inflightActive(existing.response)) return { owned: false, reason: "inflight" };

  let q = admin.from("capi_events").update({ ok: null, response: claim })
    .eq("contact_id", contact.id).eq("event_name", eventName);
  q = existing.response == null ? q.is("response", null) : q.eq("response", existing.response);
  q = existing.ok === true ? q.eq("ok", true) : existing.ok === false ? q.eq("ok", false) : q.is("ok", null);
  const { data: won, error: upErr } = await q.select("contact_id");
  if (upErr) return { owned: false, reason: "error", error: upErr.message };
  if (!won || won.length === 0) return { owned: false, reason: "lost" };
  return { owned: true, claim };
}

/** Remember a Purchase that has no amount yet. ok stays null so a later amount can send. */
async function deferPurchase(
  admin: SupabaseClient,
  contact: { id: string; company_id: string; lead_source_id: string | null },
  eventName: string,
  existing: EventRow | null,
  attempts: number,
): Promise<"waiting" | "inflight" | "error"> {
  if (existing && inflightActive(existing.response)) return "inflight";
  const response = envelope({
    attempts,
    value: null,
    currency: null,
    value_source: "none",
    meta: "",
    error: "Purchase is waiting for a token amount. Nothing was sent to Meta.",
    deferred: true,
  });
  const metaLeadId = contact.lead_source_id ? String(contact.lead_source_id) : null;
  if (!existing) {
    const { error } = await admin.from("capi_events").insert({
      company_id: contact.company_id,
      contact_id: contact.id,
      event_name: eventName,
      meta_lead_id: metaLeadId,
      ok: null,
      response,
    });
    if (!error) return "waiting";
    if (error.code !== "23505") return "error";
    const raced = await readEvent(admin, contact.id, eventName);
    if (!raced || inflightActive(raced.response)) return "inflight";
    existing = raced;
  }
  let q = admin.from("capi_events").update({ ok: null, response })
    .eq("contact_id", contact.id).eq("event_name", eventName);
  q = existing.response == null ? q.is("response", null) : q.eq("response", existing.response);
  q = existing.ok === true ? q.eq("ok", true) : existing.ok === false ? q.eq("ok", false) : q.is("ok", null);
  const { error: upErr } = await q;
  if (upErr) return "error";
  return "waiting";
}

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
  let existing = await readEvent(admin, contact.id, eventName);
  const logged = parseLog(existing?.response);
  const priorValued = valuedPurchase(logged);

  // A finished, valued Purchase (or any other event already accepted) is done.
  // A Purchase marked sent with no amount is NOT done: ok=true must not block
  // the amount when it shows up.
  if (existing?.ok === true && (eventName !== "Purchase" || priorValued || money.value == null)) {
    if (eventName === "Purchase" && !priorValued && money.value == null) {
      const held = await deferPurchase(admin, contact, eventName, existing, logged.attempts);
      if (held === "inflight") return { ok: true, skipped: IN_FLIGHT, event_name: eventName };
      if (held === "error") return { ok: false, error: "Could not record that this Purchase is waiting for an amount.", event_name: eventName };
      return { ok: true, skipped: WAITING, event_name: eventName, value_source: "none" };
    }
    return { ok: true, skipped: "already sent", event_name: eventName };
  }

  if (eventName === "Purchase" && money.value == null) {
    const held = await deferPurchase(admin, contact, eventName, existing, logged.attempts);
    if (held === "inflight") return { ok: true, skipped: IN_FLIGHT, event_name: eventName };
    if (held === "error") return { ok: false, error: "Could not record that this Purchase is waiting for an amount.", event_name: eventName };
    return { ok: true, skipped: WAITING, event_name: eventName, value_source: "none" };
  }

  // Attempts of a valueless Purchase do not count against the valued payload.
  const prior = eventName === "Purchase" && !priorValued ? 0 : logged.attempts;
  const samePayload = eventName !== "Purchase" || priorValued;
  if (existing && samePayload && (logged.stopped || logged.attempts >= MAX_ATTEMPTS)) {
    return {
      ok: false, skipped: "stopped after failed attempts",
      event_name: eventName, attempts: logged.attempts,
    };
  }

  const valueUpdate = existing?.ok === true && eventName === "Purchase" && !priorValued && money.value != null;
  const claimed = await claimRow(admin, contact, eventName, existing, prior);
  if (!claimed.owned) {
    if (claimed.reason === "error") return { ok: false, error: claimed.error ?? "Could not claim the event row.", event_name: eventName };
    return { ok: true, skipped: IN_FLIGHT, event_name: eventName };
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
      event_id: eventIdFor(contact.id, eventName),
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
  const dedupe = valueUpdate
    ? "Same event_id as a Purchase already marked sent with no amount. Meta keeps the first event with this event_name and event_id for about 48 hours, so this post may not replace that value."
    : null;
  const { data: saved, error: saveErr } = await admin.from("capi_events")
    .update({
      ok,
      response: envelope({
        attempts, value: money.value, currency: money.currency,
        value_source: money.value_source, meta: responseText, error: err, stopped, dedupe,
      }),
    })
    .eq("contact_id", contact.id).eq("event_name", eventName)
    .eq("response", claimed.claim)
    .select("contact_id");

  if (saveErr) {
    return { ok: false, event_name: eventName, attempts, error: saveErr.message };
  }
  if (!saved || saved.length === 0) {
    return {
      ok: false, event_name: eventName, attempts,
      error: "Meta answered, but another send took the row before the result was saved.",
    };
  }

  return {
    ok, event_name: eventName, attempts,
    value: money.value, currency: money.currency, value_source: money.value_source,
    error: err ?? undefined,
  };
}

async function retryFailed(admin: SupabaseClient, companyId: string | null): Promise<Response> {
  let failedQ = admin.from("capi_events")
    .select("contact_id, event_name, response")
    .or("ok.eq.false,ok.is.null")
    .order("ok", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
    .limit(80);
  if (companyId) failedQ = failedQ.eq("company_id", companyId);

  // Purchases marked sent with no amount. Newest first: a fresh lock is the
  // one Retry must still be able to give a value. Rows that already carry
  // token_amount are left alone.
  let lockedQ = admin.from("capi_events")
    .select("contact_id, event_name, response")
    .eq("event_name", "Purchase")
    .eq("ok", true)
    .not("response", "ilike", "%token_amount%")
    .order("created_at", { ascending: false })
    .limit(40);
  if (companyId) lockedQ = lockedQ.eq("company_id", companyId);

  const [failedRes, lockedRes] = await Promise.all([failedQ, lockedQ]);
  if (failedRes.error) return json({ ok: false, error: failedRes.error.message }, 500);

  type Row = { contact_id: string; event_name: string; response: string | null };
  const seen = new Set<string>();
  const rows: Row[] = [];
  for (const row of [...(failedRes.data ?? []), ...(lockedRes.error ? [] : lockedRes.data ?? [])] as Row[]) {
    const key = `${row.contact_id}:${row.event_name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(row);
  }

  const started = Date.now();
  let sent = 0, still_failed = 0, skipped_cap = 0, tried = 0, waiting = 0, in_flight = 0;
  let stopped_early = false;
  for (const row of rows) {
    if (tried >= RETRY_POSTS || Date.now() - started > RETRY_BUDGET_MS) {
      stopped_early = true;
      break;
    }
    const result = await sendOne(admin, String(row.contact_id), undefined, String(row.event_name));
    if (result.skipped === WAITING) { waiting++; continue; }
    if (result.skipped === IN_FLIGHT) { in_flight++; continue; }
    if (result.skipped === "stopped after failed attempts" || result.skipped === "already sent") {
      skipped_cap++;
      continue;
    }
    if (result.skipped) { skipped_cap++; continue; }
    tried++;
    if (result.ok) sent++;
    else still_failed++;
  }

  const note = stopped_early
    ? "Stopped after this batch. Press Retry again for the rest."
    : tried === 0 && waiting === 0 && in_flight === 0
      ? "No failed events to retry."
      : tried === 0 && in_flight > 0
        ? "A send is already running. Nothing new was posted."
        : undefined;
  return json({
    ok: true,
    tried, sent, still_failed, skipped_cap, waiting, in_flight,
    locked_error: lockedRes.error?.message ?? null,
    note,
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
