// The weekly report card, for the people who look after it.
//
// The card itself is built in _shared/weekreview.ts and SENT by pulse-broadcast
// on its Monday 10 AM tick — there is one scheduler that messages telecallers,
// and this is not a second one. This function does the two jobs around it:
//
//   cron, early Monday (service key)   { mode: "build", limit }
//     Builds the week's cards ahead of the send, a few reps per run, so the AI
//     is paid for before 10 AM and never inside the send loop.
//
//   admin (JWT)
//     { mode: "list", company_id? }            every telecaller + what their card can say
//     { mode: "preview", salesperson_id, rebuild? }   the card, built once and kept
//     { mode: "send", salesperson_id }         that same card to their WhatsApp
//     { mode: "switch", on }                   super admin: Monday sending on/off
//
// A company admin only ever sees and sends their own company's telecallers. The
// super admin sees every company, or one when company_id is given.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { notifyFounder } from "../_shared/notify.ts";
import {
  buildWeekReview, defaultWeekTo, markWeekReviewSent, storedWeekReview, type WeekRep,
} from "../_shared/weekreview.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

type Recipient = WeekRep & { phone: string | null; has_phone: boolean; company_on: boolean };

const RECIPIENT_COLS = "salesperson_id, company_id, full_name, phone, company_name, has_phone, company_on";

async function recipient(admin: SupabaseClient, repId: string): Promise<Recipient | null> {
  const { data } = await admin.from("v_rep_review_recipients").select(RECIPIENT_COLS)
    .eq("salesperson_id", repId).maybeSingle();
  return (data as Recipient | null) ?? null;
}

/** The stored card, or build and keep it. */
async function cardFor(admin: SupabaseClient, rep: Recipient, weekTo: string, rebuild: boolean) {
  if (!rebuild) {
    const kept = await storedWeekReview(admin, rep.salesperson_id, weekTo);
    if (kept) return { text: kept.text, recorded: kept.recorded_calls, built_at: kept.built_at, sent_at: kept.sent_at, error: null };
  }
  const b = await buildWeekReview(admin, rep, { coach: true, store: true, weekTo });
  const kept = await storedWeekReview(admin, rep.salesperson_id, weekTo);
  return { text: b.text, recorded: b.recorded, built_at: kept?.built_at ?? null, sent_at: kept?.sent_at ?? null, error: b.error };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const admin = createClient(SUPABASE_URL, SERVICE);
  const weekTo = defaultWeekTo();

  // ---- cron: build this week's cards before the 10 AM send ----
  if (bearer === SERVICE) {
    if (body.mode !== "build") return json({ ok: false, error: "unknown service mode" }, 400);
    const { data: gate } = await admin.from("platform_automation").select("rep_weekly_on").maybeSingle();
    // Off means nobody receives it, so nothing is worth paying the AI for.
    if (!gate?.rep_weekly_on) return json({ ok: true, skipped: "weekly review is switched off" });
    const limit = Math.min(Math.max(Number(body.limit) || 3, 1), 6);

    const [{ data: recips }, { data: done }] = await Promise.all([
      admin.from("v_rep_review_recipients").select(RECIPIENT_COLS).eq("has_phone", true).eq("company_on", true),
      admin.from("rep_week_reviews").select("salesperson_id").eq("week_to", weekTo),
    ]);
    const built = new Set(((done ?? []) as { salesperson_id: string }[]).map((r) => r.salesperson_id));
    const todo = ((recips ?? []) as Recipient[]).filter((r) => !built.has(r.salesperson_id));
    let ok = 0, failed = 0;
    for (const r of todo.slice(0, limit)) {
      try {
        const b = await buildWeekReview(admin, r, { coach: true, store: true, weekTo });
        if (b.error) failed++; else ok++;
      } catch (_) {
        // One rep's broken data must never stop the rest of the floor's cards.
        failed++;
      }
    }
    return json({ ok: true, week_to: weekTo, built: ok, failed, remaining: Math.max(0, todo.length - limit) });
  }

  // ---- admin ----
  const u = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: `Bearer ${bearer}` } } });
  const { data: ud } = await u.auth.getUser();
  if (!ud?.user) return json({ ok: false, error: "Unauthorized" }, 401);
  const [{ data: me }, { data: pa }] = await Promise.all([
    admin.from("profiles").select("role, company_id").eq("id", ud.user.id).maybeSingle(),
    admin.from("platform_admins").select("user_id").eq("user_id", ud.user.id).maybeSingle(),
  ]);
  const isSuper = !!pa;
  if (me?.role !== "admin" && !isSuper) return json({ ok: false, error: "Admins only" }, 403);
  const mayActOn = (companyId: string) => isSuper || companyId === me?.company_id;

  if (body.mode === "switch") {
    if (!isSuper) return json({ ok: false, error: "Only the platform owner can switch this." }, 403);
    const on = body.on === true;
    const { error } = await admin.from("platform_automation")
      .update({ rep_weekly_on: on, updated_at: new Date().toISOString(), updated_by: ud.user.id }).eq("id", true);
    if (error) return json({ ok: false, error: error.message }, 500);
    return json({ ok: true, on });
  }

  if (body.mode === "list") {
    const companyId = isSuper ? (typeof body.company_id === "string" && body.company_id ? body.company_id : null) : me!.company_id as string;
    let q = admin.from("v_rep_review_recipients").select(RECIPIENT_COLS).order("company_name").order("full_name");
    if (companyId) q = q.eq("company_id", companyId);
    const { data: recips, error } = await q;
    if (error) return json({ ok: false, error: error.message }, 500);
    const reps = (recips ?? []) as Recipient[];
    const ids = reps.map((r) => r.salesperson_id);
    const weekFrom = new Date(new Date(`${weekTo}T00:00:00Z`).getTime() - 6 * 86400_000).toISOString().slice(0, 10);

    // A count per rep rather than rows: the API returns at most 1000 rows, and
    // two busy telecallers would have filled that and undercounted everyone.
    const fromIso = new Date(`${weekFrom}T00:00:00+05:30`).toISOString();
    const toIso = new Date(new Date(`${weekTo}T00:00:00+05:30`).getTime() + 86400_000).toISOString();
    const [counts, { data: cards }, { data: gate }] = await Promise.all([
      Promise.all(ids.map((id) => admin.from("call_logs").select("id", { count: "exact", head: true })
        .eq("salesperson_id", id).gte("started_at", fromIso).lt("started_at", toIso)
        .gte("duration_seconds", 30).not("summary", "is", null)
        .then((r) => [id, r.count ?? 0] as const))),
      ids.length
        ? admin.from("rep_week_reviews").select("salesperson_id, built_at, sent_at").eq("week_to", weekTo).in("salesperson_id", ids)
        : Promise.resolve({ data: [] }),
      admin.from("platform_automation").select("rep_weekly_on").maybeSingle(),
    ]);
    const recorded = new Map<string, number>(counts);
    const card = new Map(((cards ?? []) as { salesperson_id: string; built_at: string; sent_at: string | null }[])
      .map((c) => [c.salesperson_id, c]));
    return json({
      ok: true,
      week_from: weekFrom,
      week_to: weekTo,
      monday_on: gate?.rep_weekly_on === true,
      reps: reps.map((r) => ({
        salesperson_id: r.salesperson_id,
        full_name: r.full_name,
        company_id: r.company_id,
        company_name: r.company_name,
        has_phone: r.has_phone,
        // Last four only: the page needs to say which phone, not to dial it.
        phone_tail: r.phone ? r.phone.replace(/\D/g, "").slice(-4) : null,
        company_on: r.company_on,
        recorded_calls: recorded.get(r.salesperson_id) ?? 0,
        built_at: card.get(r.salesperson_id)?.built_at ?? null,
        sent_at: card.get(r.salesperson_id)?.sent_at ?? null,
      })),
    });
  }

  if (body.mode === "preview" || body.mode === "send") {
    const rep = await recipient(admin, String(body.salesperson_id ?? ""));
    if (!rep) return json({ ok: false, error: "Not a telecaller, or not active." }, 404);
    if (!mayActOn(rep.company_id)) return json({ ok: false, error: "Not your company." }, 403);

    const c = await cardFor(admin, rep, weekTo, body.mode === "preview" && body.rebuild === true);
    if (!c.text) {
      return json({ ok: true, preview: null, note: "Nothing to review: no calls and no follow-ups in the last 7 days." });
    }
    if (body.mode === "preview") {
      return json({ ok: true, preview: c.text, recorded: c.recorded, built_at: c.built_at, sent_at: c.sent_at, note: c.error });
    }
    if (!rep.has_phone || !rep.phone) {
      return json({
        ok: false,
        error: "This telecaller has no WhatsApp number. Add it on the Salespeople page, or as their own report on Daily Pulse.",
      });
    }
    const res = await notifyFounder(admin, { companyId: rep.company_id, to: rep.phone, body: c.text, kind: "rep_weekly" });
    if (res.ok) await markWeekReviewSent(admin, rep.salesperson_id, weekTo);
    return json(res);
  }

  return json({ ok: false, error: "unknown mode" }, 400);
});
