// The four things worth interrupting a founder for, and nothing else.
//
// The Daily Pulse is a report. This is news: a booking at 3:40pm, or a customer
// who walked the site this morning and still has not been rung back. Both are
// worth less every hour they wait, and by 7pm they are one line among twenty.
//
// EVERYTHING about this function is built around not becoming spam, because
// spam is the only way it can fail. A founder who gets pinged for every lead
// movement mutes the number within a week — and then the one booking alert that
// mattered arrives silently. So:
//
//   · Four kinds. Every "wouldn't it also be useful to know…" is a step towards
//     the muted number, and the answer is the 7pm pulse, which already has it.
//   · One alert per lead per kind, EVER, enforced by a unique index rather than
//     by code that has to remember. The row is inserted before the send and the
//     constraint decides: conflict means it already went, so nothing is sent. A
//     retry, a double cron tick, or a lead flipping booked → negotiation →
//     booked cannot produce a second message.
//   · One WhatsApp per run, never one per event. Three bookings in fifteen
//     minutes is three lines in one message.
//   · 9am-9pm IST only. An alert that buzzes at 2am gets the feature switched
//     off, whatever it said.
//   · A first run on an existing database would fire hundreds of alerts for
//     history. It only ever looks at the last 24 hours, and the sent-log
//     absorbs the rest.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { notifyFounder } from "../_shared/notify.ts";
import { PULSE_FOOTER } from "../_shared/pulse.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const IST_MS = 5.5 * 3600 * 1000;
const istHour = () => new Date(Date.now() + IST_MS).getUTCHours();

/** Indian money, the way it is read out loud. */
function rupees(n: number): string {
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(n % 10_000_000 === 0 ? 0 : 2)}Cr`;
  if (n >= 100_000) return `₹${(n / 100_000).toFixed(n % 100_000 === 0 ? 0 : 2)}L`;
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}
function istWhen(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true,
  });
}

type Alert = { kind: string; contactId: string; text: string };

/**
 * What happened in the last day that a founder would want to know within the
 * hour. Read from the contacts themselves rather than from an activity feed:
 * a lead's CURRENT state is the thing that is true, and an activity row can say
 * "moved to booked" about a lead that has since been un-booked by a correction.
 */
async function findAlerts(admin: SupabaseClient, companyId: string): Promise<Alert[]> {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const out: Alert[] = [];

  const [{ data: reps }, { data: rows }] = await Promise.all([
    admin.from("profiles").select("id, full_name").eq("company_id", companyId),
    admin.from("contacts")
      .select("id, name, phone, status, token_amount, site_visit_at, site_visit_arrived_at, " +
        "site_visit_verified, salesperson_id, updated_at, site_visit_project")
      .eq("company_id", companyId)
      .gte("updated_at", since)
      .limit(500),
  ]);
  const repName = new Map((reps ?? []).map((r) => [String(r.id), String(r.full_name ?? "Executive")]));

  for (const c of rows ?? []) {
    const lead = String(c.name ?? c.phone ?? "Lead");
    const who = c.salesperson_id ? repName.get(String(c.salesperson_id)) ?? "Executive" : "Unassigned";
    const project = c.site_visit_project ? `\n📍 Project: ${c.site_visit_project}` : "";
    const id = String(c.id);
    const status = String(c.status ?? "");
    const token = Number(c.token_amount ?? 0) || 0;

    if (status === "booked") {
      out.push({
        kind: "booking_confirmed", contactId: id,
        text: `🎉 BOOKING CONFIRMED\n\n👤 Customer: ${lead}\n👩 Executive: ${who}${project}` +
          (token > 0 ? `\n💰 Booking amount: ${rupees(token)}` : ""),
      });
      continue; // A booked lead is not also a site-visit story.
    }
    if (status === "token_paid" && token > 0) {
      out.push({
        kind: "sale_closed", contactId: id,
        text: `🏆 PAYMENT RECEIVED\n\n👤 Customer: ${lead}\n👩 Executive: ${who}${project}\n💰 ${rupees(token)}`,
      });
      continue;
    }
    // Came to the site, and nobody has confirmed what they thought. The single
    // most expensive thing to leave sitting in a real-estate pipeline.
    if (c.site_visit_arrived_at && c.site_visit_verified !== true) {
      out.push({
        kind: "site_visit_done", contactId: id,
        text: `✅ SITE VISIT COMPLETED\n\n👤 Customer: ${lead}\n👩 Executive: ${who}${project}\n` +
          `🎯 Feedback call within 24 hours — decision abhi pending hai.`,
      });
      continue;
    }
    // A visit on the books, in the future. Not "a visit exists" — a date that
    // has already gone by is not news, it is a chase.
    const visitAt = c.site_visit_at ? Date.parse(String(c.site_visit_at)) : NaN;
    if (Number.isFinite(visitAt) && visitAt > Date.now()) {
      out.push({
        kind: "site_visit_fixed", contactId: id,
        text: `📍 SITE VISIT FIXED\n\n👤 Customer: ${lead}\n👩 Executive: ${who}${project}\n` +
          `📅 Visit: ${istWhen(String(c.site_visit_at))}`,
      });
    }
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const cronHeader = req.headers.get("x-cron-secret") ?? "";
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!((CRON_SECRET && cronHeader === CRON_SECRET) || (!!bearer && bearer === SERVICE))) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  // Quiet hours are the default and the override is deliberate: "force" exists
  // so an admin can test this at 11pm without waiting until morning, which is
  // the same reason pulse-broadcast has a Send now.
  const hour = istHour();
  if (!body.force && (hour < 9 || hour >= 21)) {
    return json({ ok: true, skipped: "quiet hours", hour });
  }

  const admin = createClient(SUPABASE_URL, SERVICE);
  const { data: subs } = await admin.from("pulse_subscribers")
    .select("id, company_id, phone").eq("active", true).eq("alerts_on", true);

  // Group recipients by company: the day's news is found ONCE per company, not
  // once per person on the list.
  const byCompany = new Map<string, string[]>();
  for (const s of subs ?? []) {
    const cid = String(s.company_id);
    if (!byCompany.has(cid)) byCompany.set(cid, []);
    byCompany.get(cid)!.push(String(s.phone));
  }

  let sent = 0, claimed = 0, seeded = 0, failed = 0;
  for (const [companyId, phones] of byCompany) {
    try {
      const found = await findAlerts(admin, companyId);
      if (!found.length) continue;

      // The first run for a company records what is already true and sends
      // NOTHING. Switching this on at a company with a live pipeline would
      // otherwise open with a wall of alerts about visits booked yesterday and
      // a booking from this morning that the founder already knows about —
      // which is precisely the impression ("this thing spams") that gets the
      // number muted before it has ever delivered real news. After the seed,
      // the sent-log means only genuinely new milestones can alert.
      const { count: seen } = await admin.from("founder_alerts")
        .select("id", { count: "exact", head: true }).eq("company_id", companyId);
      if ((seen ?? 0) === 0) {
        await admin.from("founder_alerts").insert(found.map((a) => ({
          company_id: companyId, contact_id: a.contactId, kind: a.kind,
          detail: "(baseline — not sent)",
        })));
        seeded += found.length;
        continue;
      }

      // Claim first, send second. The unique index is what makes this whole
      // feature safe, so it has to be consulted BEFORE the WhatsApp goes out —
      // claiming afterwards would mean a crash between the two sends the same
      // alert again on the next tick.
      const fresh: Alert[] = [];
      for (const a of found) {
        const { error } = await admin.from("founder_alerts").insert({
          company_id: companyId, contact_id: a.contactId, kind: a.kind, detail: a.text.slice(0, 500),
        });
        if (!error) fresh.push(a);   // a conflict means it already went out
      }
      if (!fresh.length) continue;
      claimed += fresh.length;

      // One message, however many happened. Five bookings in a good hour is
      // wonderful news and still exactly one buzz.
      const text = fresh.length === 1
        ? `${fresh[0].text}\n\n${PULSE_FOOTER}`
        : `🔔 ${fresh.length} updates\n\n${fresh.map((a) => a.text).join("\n\n━━━━━━━━\n\n")}\n\n${PULSE_FOOTER}`;

      for (const to of phones) {
        const r = await notifyFounder(admin, { companyId, to, body: text, kind: "alert" });
        if (r.ok) sent++; else failed++;
      }
    } catch (_) {
      // One company's broken WhatsApp must never stop another company's alerts.
      failed++;
    }
  }
  return json({ ok: true, hour, companies: byCompany.size, claimed, seeded, sent, failed });
});
