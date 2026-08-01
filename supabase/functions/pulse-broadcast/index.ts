// Sends the daily pulse to the founder's WhatsApp, at the hour they chose.
//
// Two ways in:
//   • Cron (hourly, service-role bearer) — every subscriber whose send_hour_ist
//     is the hour it currently is in India, across every company.
//   • Admin "Send now" (JWT) — one subscriber, for testing. An automation you
//     cannot test until 7pm tomorrow is an automation nobody switches on.
//
// The report itself comes from ../_shared/pulse.ts, the same builder the Pulse
// page reads, so what lands on the phone is what the dashboard shows.
//
// ONE HONEST LIMIT, worth knowing before switching this on: WhatsApp's Cloud
// API only allows free-form text within 24 hours of that person's last message
// to the business number. A 7pm push is outside that window on a normal day, so
// Meta rejects it (error 131047) unless an approved TEMPLATE is used. This tries
// free text, falls back to the configured template, and when neither is possible
// it stores the reason in plain words rather than failing silently — because a
// digest that quietly stopped arriving is worse than one that never started.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { buildCompany, istDate, istHour, pulseText, splitForWhatsApp } from "../_shared/pulse.ts";

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
const GRAPH = "https://graph.facebook.com/v21.0";

type Sub = {
  id: string; company_id: string; label: string; phone: string;
  send_hour_ist: number; template_name: string | null;
};

/**
 * Meta answers the 24-hour rule with a code and a paragraph of API English.
 * Turn it into the one sentence that says what to actually do — this string is
 * shown to the person who set the number up, not to a developer.
 */
function humanError(code: number | undefined, msg: string): string {
  if (code === 131047 || /re-engagement|24 hour|24-hour/i.test(msg)) {
    return "WhatsApp only allows a plain message within 24 hours of that person messaging your business number. " +
      "For a daily 7pm report you need an approved WhatsApp template — get one approved in Meta Business Manager, " +
      "then put its name in the Template field here. Quick workaround until then: have them send any message to " +
      "your WhatsApp business number, and today's report will go through.";
  }
  if (code === 131030 || /not in allowed list/i.test(msg)) {
    return "This number isn't on your WhatsApp app's allowed test-recipient list. Add it in Meta (API Setup → " +
      "recipient phone number), or take the app out of test mode.";
  }
  if (/token/i.test(msg) && /expire|invalid/i.test(msg)) {
    return "The WhatsApp access token has expired — reconnect WhatsApp in admin, then try again.";
  }
  return msg;
}

/** One WhatsApp send. Returns the message id, or the error to store. */
async function sendText(
  phoneNumberId: string, token: string, to: string, body: string,
): Promise<{ id?: string; error?: string; code?: number }> {
  const r = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp", to,
      type: "text", text: { preview_url: false, body },
    }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) return { error: d?.error?.message ?? "send failed", code: d?.error?.code };
  return { id: d?.messages?.[0]?.id };
}

/**
 * The out-of-window fallback.
 *
 * Meta forbids newlines in a template's PARAMETERS, so the full multi-line
 * report physically cannot be pushed through one. What fits is the headline —
 * which is still the sentence the founder actually reads — and it re-opens the
 * 24-hour window the moment they reply, so the detail can follow.
 */
async function sendTemplate(
  phoneNumberId: string, token: string, to: string, name: string, params: string[],
): Promise<{ id?: string; error?: string; code?: number }> {
  const r = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp", to, type: "template",
      template: {
        name, language: { code: "en" },
        components: params.length
          ? [{ type: "body", parameters: params.map((t) => ({ type: "text", text: t })) }]
          : [],
      },
    }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) return { error: d?.error?.message ?? "template send failed", code: d?.error?.code };
  return { id: d?.messages?.[0]?.id };
}

/**
 * Which WhatsApp number sends this company's report.
 *
 * Their own, if they have one — a founder would rather hear from their own
 * brand. Otherwise the platform's shared number, the same way one central
 * Facebook ad account already runs ads for every company. Seven of eight
 * companies have no Cloud API app of their own, and making each new customer
 * build one before their founder gets a report is how a feature ships and then
 * nobody uses it.
 *
 * Sharing the pipe is not sharing the data: the report itself is still built
 * from sub.company_id and nothing else.
 */
async function resolveSender(
  admin: SupabaseClient, companyId: string,
): Promise<{ phoneNumberId: string; token: string; borrowed: boolean } | { error: string }> {
  const pick = async (cid: string) => {
    const { data: i } = await admin.from("whatsapp_integrations")
      .select("phone_number_id, active").eq("company_id", cid).maybeSingle();
    if (!i?.active || !i.phone_number_id) return null;
    const { data: t } = await admin.rpc("get_whatsapp_token", { p_company: cid });
    return t ? { phoneNumberId: String(i.phone_number_id), token: String(t) } : null;
  };

  const own = await pick(companyId);
  if (own) return { ...own, borrowed: false };

  const { data: pw } = await admin.from("platform_whatsapp").select("company_id").maybeSingle();
  if (pw?.company_id) {
    const shared = await pick(pw.company_id);
    if (shared) return { ...shared, borrowed: true };
  }
  return {
    error: "No WhatsApp number can send this. Either connect WhatsApp for this company, or pick a " +
      "platform sending number on the WhatsApp page (super admin) so every company can share one.",
  };
}

async function deliver(admin: SupabaseClient, sub: Sub, date: string) {
  const { data: company } = await admin.from("companies").select("name").eq("id", sub.company_id).maybeSingle();
  const companyName = company?.name ?? null;

  const from = await resolveSender(admin, sub.company_id);
  if ("error" in from) return { ok: false, error: from.error };
  const integ = { phone_number_id: from.phoneNumberId };
  const token = from.token;

  const pulse = await buildCompany(admin, sub.company_id, date);
  // Nothing happened all day: say that in one line rather than sending an
  // elaborate report full of zeroes, which reads like the CRM is broken.
  const text = pulse.totals.calls === 0 && pulse.totals.notes === 0
    ? `📊 ${companyName ? `${companyName} · ` : ""}Daily Pulse\n${date}\n\nNo calls logged today.\n\n— via Call Pro AI`
    : pulseText(pulse, companyName);

  const parts = splitForWhatsApp(text);
  let firstId: string | undefined;
  let sentBody = "";
  for (const [i, part] of parts.entries()) {
    const tagged = parts.length > 1 ? `${part}\n\n(${i + 1}/${parts.length})` : part;
    const res = await sendText(integ.phone_number_id, String(token), sub.phone, tagged);
    if (res.error) {
      // Out of the 24-hour window on the FIRST part: fall back to the template
      // so the founder still gets the headline. Failing mid-way through a split
      // report is different — the earlier parts already landed, so stop and say
      // so rather than following them with an unrelated template.
      if (i === 0 && sub.template_name) {
        const t = await sendTemplate(integ.phone_number_id, String(token), sub.phone, sub.template_name, [
          companyName ?? "Your team",
          `${pulse.totals.calls} calls, ${pulse.totals.connected} connected, ${pulse.totals.visits} site visits`,
        ]);
        if (t.id) {
          await logMessage(admin, sub, t.id, `[template ${sub.template_name}] ${text}`, sub.template_name);
          return { ok: true, via: "template", parts: 1 };
        }
        return { ok: false, error: humanError(t.code, t.error ?? "template send failed") };
      }
      return { ok: false, error: humanError(res.code, res.error ?? "send failed"), sent_parts: i };
    }
    firstId ??= res.id;
    sentBody = sentBody ? `${sentBody}\n${part}` : part;
  }

  await logMessage(admin, sub, firstId ?? null, sentBody, null);
  return { ok: true, via: "text", parts: parts.length, borrowed_number: from.borrowed };
}

/**
 * Logged into whatsapp_messages like every other outbound, so the super admin
 * sees the founder's digest in the same place as the reps' messages instead of
 * having to know a second table exists. salesperson_id stays null: nobody sent
 * this, the schedule did.
 */
async function logMessage(
  admin: SupabaseClient, sub: Sub, waId: string | null, body: string, template: string | null,
) {
  await admin.from("whatsapp_messages").insert({
    company_id: sub.company_id,
    direction: "out",
    wa_message_id: waId,
    counterparty: sub.phone,
    body,
    msg_type: template ? "template" : "text",
    template_name: template,
    status: "sent",
  });
}

async function record(admin: SupabaseClient, id: string, status: string, error: string | null) {
  await admin.from("pulse_subscribers")
    .update({ last_sent_at: new Date().toISOString(), last_status: status, last_error: error })
    .eq("id", id);
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

    let sent = 0, failed = 0;
    for (const s of (subs ?? []) as Sub[]) {
      try {
        const r = await deliver(admin, s, date);
        if (r.ok) { sent++; await record(admin, s.id, "sent", null); }
        else { failed++; await record(admin, s.id, "failed", r.error ?? "unknown"); }
      } catch (e) {
        // One company's broken WhatsApp must never stop the other companies'
        // reports going out.
        failed++;
        await record(admin, s.id, "failed", String(e).slice(0, 500));
      }
    }
    return json({ ok: true, hour, date, considered: subs?.length ?? 0, sent, failed });
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
    await record(admin, sub.id, r.ok ? "sent" : "failed", r.ok ? null : (r.error ?? "unknown"));
    return json(r);
  } catch (e) {
    await record(admin, sub.id, "failed", String(e).slice(0, 500));
    return json({ ok: false, error: String(e) });
  }
});
