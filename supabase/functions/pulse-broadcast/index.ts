// Sends the daily pulse to the founder's WhatsApp, at the hour they chose.
//
// Two ways in:
//   • Cron (hourly, service-role bearer) — every subscriber whose send_hour_ist
//     is the hour it currently is in India, across every company.
//   • Admin "Send now" (JWT) — one subscriber, for testing. An automation you
//     cannot test until 7pm tomorrow is an automation nobody switches on.
//
// The report comes from ../_shared/pulse.ts, the same builder the Pulse page
// reads, so what lands on the phone is what the dashboard shows. Getting it
// there is ../_shared/notify.ts's problem, not this file's: this used to hold
// Meta's Graph URL, Meta's token lookup, Meta's 24-hour rule and Meta's
// template fallback inline, which meant "send the founder their report" and
// "talk to the Cloud API" were one lump of code and a second transport could
// only be added by forking it. Now it asks for the report to be sent and does
// not know, or need to know, which WhatsApp pipe carried it.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { buildCompany, istDate, istHour, PULSE_FOOTER, pulseText } from "../_shared/pulse.ts";
import { notifyFounder } from "../_shared/notify.ts";

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
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

type Sub = {
  id: string; company_id: string; label: string; phone: string;
  send_hour_ist: number; template_name: string | null;
};

async function deliver(admin: SupabaseClient, sub: Sub, date: string) {
  const { data: company } = await admin.from("companies").select("name").eq("id", sub.company_id).maybeSingle();
  const companyName = company?.name ?? null;

  const pulse = await buildCompany(admin, sub.company_id, date);
  // Nothing happened all day: say that in one line rather than sending an
  // elaborate report full of zeroes, which reads like the CRM is broken.
  const text = pulse.totals.calls === 0 && pulse.totals.notes === 0
    ? `📊 ${companyName ? `${companyName} · ` : ""}Daily Pulse\n${date}\n\nNo calls logged today.\n\n${PULSE_FOOTER}`
    : pulseText(pulse, companyName);

  return await notifyFounder(admin, {
    companyId: sub.company_id,
    to: sub.phone,
    body: text,
    kind: "pulse",
    subscriberId: sub.id,
  });
}

/**
 * @param waId Meta's message id, so a later status webhook can find this
 *   subscriber and replace an optimistic "accepted" with what really happened.
 */
async function record(
  admin: SupabaseClient, id: string, status: string, error: string | null, waId?: string | null,
) {
  await admin.from("pulse_subscribers")
    .update({
      last_sent_at: new Date().toISOString(),
      last_status: status,
      last_error: error,
      last_wa_message_id: waId ?? null,
    })
    .eq("id", id);
}

/**
 * What we are allowed to claim, in one place.
 *
 * "queued" is its own state and not a failure: the pipe was down, the message is
 * held, and the drain cron will try again within five minutes. Calling that
 * failed would have the founder chasing something that is about to arrive.
 */
function verdictOf(r: Awaited<ReturnType<typeof deliver>>): { status: string; error: string | null } {
  if (!r.ok) return { status: "failed", error: r.error ?? "unknown" };
  if (r.queued) return { status: "queued", error: r.error ?? "Waiting for WhatsApp to come back." };
  // Baileys sends from a real logged-in account, so a send that returned really
  // did go. Meta only "accepted" it — the verdict arrives later by webhook.
  return { status: r.via === "baileys" ? "sent" : "accepted", error: null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const admin = createClient(SUPABASE_URL, SERVICE);
  const body = await req.json().catch(() => ({}));

  const cronHeader = req.headers.get("x-cron-secret") ?? "";
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const isCron = (CRON_SECRET && cronHeader === CRON_SECRET) || (!!bearer && bearer === SERVICE);

  // ---- Scheduled run: everyone due this hour, every company ----
  if (isCron) {
    const hour = typeof body?.hour === "number" ? body.hour : istHour();
    const date = typeof body?.date === "string" ? body.date : istDate(0);
    const { data: subs } = await admin.from("pulse_subscribers")
      .select("id, company_id, label, phone, send_hour_ist, template_name")
      .eq("active", true).eq("send_hour_ist", hour);

    let sent = 0, failed = 0, queued = 0;
    for (const s of (subs ?? []) as Sub[]) {
      try {
        const r = await deliver(admin, s, date);
        const v = verdictOf(r);
        if (v.status === "failed") failed++;
        else if (v.status === "queued") queued++;
        else sent++;
        await record(admin, s.id, v.status, v.error, r.ok ? r.wamid : null);
      } catch (e) {
        // One company's broken WhatsApp must never stop the other companies'
        // reports going out.
        failed++;
        await record(admin, s.id, "failed", String(e).slice(0, 500));
      }
    }
    return json({ ok: true, hour, date, considered: subs?.length ?? 0, sent, queued, failed });
  }

  // ---- Admin "Send now" ----
  const auth = req.headers.get("Authorization") ?? "";
  const u = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
  const { data: ud } = await u.auth.getUser();
  if (!ud?.user) return json({ ok: false, error: "Unauthorized" }, 401);

  const [{ data: me }, { data: pa }] = await Promise.all([
    admin.from("profiles").select("role, company_id").eq("id", ud.user.id).maybeSingle(),
    admin.from("platform_admins").select("user_id").eq("user_id", ud.user.id).maybeSingle(),
  ]);
  const isSuper = !!pa;
  if (me?.role !== "admin" && !isSuper) return json({ ok: false, error: "Admins only" }, 403);

  const { data: sub } = await admin.from("pulse_subscribers")
    .select("id, company_id, label, phone, send_hour_ist, template_name")
    .eq("id", body?.subscriber_id ?? "").maybeSingle();
  if (!sub) return json({ ok: false, error: "No such recipient." }, 404);
  // A company admin can only test their own company's recipient. Without this,
  // knowing a uuid would be enough to push another tenant's numbers to a phone.
  if (!isSuper && sub.company_id !== me?.company_id) return json({ ok: false, error: "Not your company." }, 403);

  const date = typeof body?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : istDate(0);
  try {
    const r = await deliver(admin, sub as Sub, date);
    const v = verdictOf(r);
    await record(admin, sub.id, v.status, v.error, r.ok ? r.wamid : null);
    return json(r);
  } catch (e) {
    await record(admin, sub.id, "failed", String(e).slice(0, 500));
    return json({ ok: false, error: String(e) });
  }
});
