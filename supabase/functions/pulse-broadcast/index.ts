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
import {
  buildCompany, istDate, istHour, PULSE_FOOTER, pulseText, repText,
  repReviewText, repWeeklyText, type RepScore, type RepWeek,
} from "../_shared/pulse.ts";
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
  /** Null = the founder, who gets the whole team. Set = one telecaller, who
   *  gets their own day and nobody else's numbers. */
  salesperson_id: string | null;
};

/**
 * The exact words this recipient would receive, built from today's real data.
 *
 * Split out from the sending so that "show me the message" and "send the
 * message" cannot drift apart. A preview assembled by a second code path is a
 * preview of nothing — the moment the two disagree, the one people trust is
 * the one that is wrong.
 */
async function buildText(
  admin: SupabaseClient, sub: Sub, date: string,
): Promise<{ text: string } | { error: string }> {
  const { data: company } = await admin.from("companies").select("name").eq("id", sub.company_id).maybeSingle();
  const companyName = company?.name ?? null;

  const pulse = await buildCompany(admin, sub.company_id, date);

  // A telecaller recipient gets repText for their own row — the same wording
  // the Pulse page's per-rep WhatsApp button sends, so a rep who has been
  // forwarded their day by the manager and a rep who subscribed to it get the
  // identical message. A rep whose row is missing (newly added, or not a
  // salesperson) is not silently sent the whole team's numbers.
  if (sub.salesperson_id) {
    const mine = pulse.reps.find((r) => r.id === sub.salesperson_id);
    if (!mine) return { error: "No report for this telecaller today." };
    return { text: repText(mine, pulse.date, companyName) };
  }

  // THIS SHORTCUT SKIPPED EVERY GUARD IN pulseText().
  //
  // 8 Aug: "📊 Manas property · Daily Pulse — No calls logged today." Shweta had
  // updated SIXTY-SEVEN leads that day. The test was `calls === 0 && notes === 0`
  // — it never looked at lead updates, and it never asked whether the phone was
  // reporting at all. Hers has never reported once (app_version NULL), so "no
  // calls logged" was not even a fact; it was an absence of data printed as a
  // finding, about a person, to her founder.
  //
  // pulseText() already handles all of this properly — the per-rep sync
  // warning, "call totals are INCOMPLETE", and an idle list that separates a rep
  // who did not work from a phone that is not reporting. The line below was
  // sitting in front of it and answering first.
  //
  // So the terse version now needs the day to be genuinely empty on EVERY
  // signal, and every phone to be reporting. Anything else goes through the
  // real report.
  const anythingHappened = pulse.totals.calls > 0 || pulse.totals.notes > 0 ||
    pulse.totals.visits > 0 || pulse.totals.bookings > 0 ||
    pulse.reps.some((r) => r.moves.length > 0) ||
    // Off-CRM phone time is not work, but a day containing 33 calls is not a
    // day with "No calls logged today" either. Send the real report.
    pulse.reps.some((r) => r.offCrmCalls > 0);
  const allPhonesReporting = pulse.reps.every((r) => r.callsTrusted);
  return {
    text: !anythingHappened && allPhonesReporting
      ? `📊 ${companyName ? `${companyName} · ` : ""}Daily Pulse\n${date}\n\nNo calls logged today.\n\n${PULSE_FOOTER}`
      : pulseText(pulse, companyName),
  };
}

async function deliver(admin: SupabaseClient, sub: Sub, date: string) {
  const built = await buildText(admin, sub, date);
  if ("error" in built) return { ok: false as const, error: built.error };
  return await notifyFounder(admin, {
    companyId: sub.company_id,
    to: sub.phone,
    body: built.text,
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

/**
 * The telecallers' own review, on the same hourly tick as everything else.
 *
 * Deliberately NOT a second cron. There is already an engine that wakes up
 * every hour, knows the IST clock, resolves a WhatsApp provider, handles the
 * outbox and logs what it sent — and the one thing guaranteed to turn this
 * product into spam is a second scheduler that does not know what the first
 * one just sent.
 *
 * Enrolment is derived, not listed: v_rep_review_recipients is every active
 * telecaller with a phone number, in every company, gated by the platform
 * switch and the company's own veto. Nobody has to remember to add a new hire.
 */
async function sendRepReviews(admin: SupabaseClient, hour: number, date: string) {
  const { data: gate } = await admin.from("platform_automation")
    .select("rep_review_on, rep_weekly_on").maybeSingle();
  // Monday, at 10am IST, about the week that just ended.
  const isMonday = new Date(`${date}T00:00:00+05:30`).getUTCDay() === 1;
  const weekly = isMonday && hour === 10 && gate?.rep_weekly_on === true;
  if (!gate?.rep_review_on && !weekly) return { skipped: "switched off" };

  const { data: recips } = await admin.from("v_rep_review_recipients")
    .select("salesperson_id, company_id, full_name, phone, company_name, rep_review_hour_ist, " +
            "enrolled, device_state, device_trustworthy")
    .eq("enrolled", true);

  let sent = 0, failed = 0, quiet = 0, untrusted = 0;
  for (const r of (recips ?? []) as Array<{
    salesperson_id: string; company_id: string; full_name: string | null;
    phone: string; company_name: string | null; rep_review_hour_ist: number;
    device_state: string; device_trustworthy: boolean;
  }>) {
    const daily = gate?.rep_review_on === true && hour === r.rep_review_hour_ist;
    if (!daily && !weekly) continue;

    // The phone has to be feeding the CRM before we grade the person.
    //
    // A rep whose device stopped reporting has a day the CRM never saw, and
    // scoring that day produces the most damaging message this product can
    // send: a low mark, in writing, for work that was actually done. It nearly
    // happened — fifteen calls made, one recorded, and an honest score of 1/100
    // waiting to go out at 7pm. Silence is the right answer, and the gap is
    // Phone Health's problem rather than the rep's.
    if (!r.device_trustworthy) { untrusted++; continue; }

    try {
      const body = weekly
        ? await weeklyBody(admin, r)
        : await dailyBody(admin, r, date);
      if (!body) { quiet++; continue; }
      const res = await notifyFounder(admin, {
        companyId: r.company_id, to: r.phone, body,
        kind: weekly ? "rep_weekly" : "rep_review",
      });
      if (res.ok) sent++; else failed++;
    } catch (_) {
      // One rep's broken number must never stop the rest of the floor's.
      failed++;
    }
  }
  return { sent, failed, quiet, untrusted, mode: weekly ? "weekly" : "daily" };
}

async function dailyBody(
  admin: SupabaseClient,
  r: { salesperson_id: string; full_name: string | null; company_name: string | null },
  date: string,
): Promise<string | null> {
  const { data } = await admin.rpc("rep_day_score", {
    p_salesperson: r.salesperson_id, p_date: date,
  });
  const s = data as RepScore | null;
  if (!s) return null;
  return repReviewText(s, r.full_name ?? "there", r.company_name);
}

async function weeklyBody(
  admin: SupabaseClient,
  r: { salesperson_id: string; full_name: string | null; company_name: string | null },
): Promise<string | null> {
  const { data } = await admin.rpc("rep_week_summary", { p_salesperson: r.salesperson_id });
  const w = data as Record<string, unknown> | null;
  if (!w) return null;
  // A week with nothing in it is not a review, it is a reminder that the rep
  // was away. Say nothing rather than send a page of zeroes.
  if ((w.calls as number) === 0 && (w.followups_completed as number) === 0) return null;
  const week: RepWeek = {
    from: String(w.from), to: String(w.to),
    calls: Number(w.calls ?? 0), connected: Number(w.connected ?? 0),
    talkSeconds: Number(w.talk_seconds ?? 0),
    bookings: Number(w.bookings ?? 0), siteVisits: Number(w.site_visits ?? 0),
    followupsScheduled: Number(w.followups_scheduled ?? 0),
    followupsCompleted: Number(w.followups_completed ?? 0),
    best: (w.best as RepWeek["best"]) ?? null,
    worst: (w.worst as RepWeek["worst"]) ?? null,
    avgScore: w.avg_score === null || w.avg_score === undefined ? null : Number(w.avg_score),
  };
  return repWeeklyText(week, r.full_name ?? "there", r.company_name);
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
      .select("id, company_id, label, phone, send_hour_ist, template_name, salesperson_id")
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
    const reviews = await sendRepReviews(admin, hour, date);
    return json({ ok: true, hour, date, considered: subs?.length ?? 0, sent, queued, failed, reviews });
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

  const date = typeof body?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : istDate(0);

  // ---- A telecaller's own review, previewed or sent on demand ----
  if (body?.rep_review) {
    const repId = String(body.rep_review.salesperson_id ?? "");
    const { data: rec } = await admin.from("v_rep_review_recipients")
      .select("salesperson_id, company_id, full_name, phone, company_name, has_phone")
      .eq("salesperson_id", repId).maybeSingle();
    if (!rec) return json({ ok: false, error: "Not a telecaller, or not active." }, 404);
    if (!isSuper && rec.company_id !== me?.company_id) {
      return json({ ok: false, error: "Not your company." }, 403);
    }
    const text = body.rep_review.weekly
      ? await weeklyBody(admin, rec as never)
      : await dailyBody(admin, rec as never, date);
    if (!text) {
      return json({ ok: true, preview: null, note: "Nothing to review for this rep on this day." });
    }
    if (body.rep_review.preview) return json({ ok: true, preview: text, to: rec.phone });
    if (!rec.has_phone) {
      return json({
        ok: false,
        error: "This telecaller has no phone number on their profile, so there is nowhere to send it. " +
          "Add it on the Salespeople page.",
      });
    }
    const res = await notifyFounder(admin, {
      companyId: rec.company_id as string, to: rec.phone as string, body: text,
      kind: body.rep_review.weekly ? "rep_weekly" : "rep_review",
    });
    return json(res);
  }

  const { data: sub } = await admin.from("pulse_subscribers")
    .select("id, company_id, label, phone, send_hour_ist, template_name, salesperson_id")
    .eq("id", body?.subscriber_id ?? "").maybeSingle();
  if (!sub) return json({ ok: false, error: "No such recipient." }, 404);
  // A company admin can only test their own company's recipient. Without this,
  // knowing a uuid would be enough to push another tenant's numbers to a phone.
  if (!isSuper && sub.company_id !== me?.company_id) return json({ ok: false, error: "Not your company." }, 403);


  // ---- Preview: today's real report, delivered nowhere ----
  //
  // The difference between this and Send now is the whole point. Sending to
  // check the wording means the founder's phone buzzes every time somebody
  // adjusts a line, and the recipient's last_sent_at stops meaning "the report
  // went out today". Preview touches neither.
  if (body?.preview) {
    const built = await buildText(admin, sub as Sub, date);
    return "error" in built
      ? json({ ok: false, error: built.error })
      : json({ ok: true, preview: built.text, to: sub.phone, label: sub.label });
  }

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
