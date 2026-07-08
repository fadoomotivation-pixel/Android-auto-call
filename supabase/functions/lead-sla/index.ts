// The 5-Minute Rule engine — speed-to-lead SLA guard.
//
// In real estate, a lead called within 5 minutes converts many times better
// than one called after 30. This cron (every 10 min, IST work hours) finds
// fresh leads that are STILL UNCALLED and turns the clock into action:
//
//   • > 10 min uncalled → push the rep: "⏱️ naya lead thanda ho raha hai"
//   • > 45 min uncalled → escalation: push the rep again (urgent) and stamp
//     an AI Assistant entry in the lead's Journey so the owner sees the miss.
//
// Dedup via contacts.extra.sla ("pinged" | "escalated") — each lead gets at
// most one nudge and one escalation. Everything reuses existing rails
// (notify-rep pushes on the hot_leads channel, lead_activities journal), so
// the telecaller app needs NO update.
//
// Body: { dry_run?: boolean }  ·  Auth: service role only (pg_cron calls it).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const NUDGE_AFTER_MIN = 10;
const ESCALATE_AFTER_MIN = 45;
const FRESH_WINDOW_HOURS = 12; // leads older than this are the bhoola-guard's job

function json(o: unknown, s = 200) {
  return new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });
}

/** IST hour (0-23) right now — pushes only during calling hours. */
function istHour(): number {
  return new Date(Date.now() + 5.5 * 3600 * 1000).getUTCHours();
}

Deno.serve(async (req) => {
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (bearer !== SERVICE) return json({ ok: false, error: "service only" }, 401);
  const { dry_run } = await req.json().catch(() => ({}));

  // Quiet outside 9:00–20:00 IST — nobody should be pinged at midnight.
  const h = istHour();
  if (h < 9 || h >= 20) return json({ ok: true, skipped: "outside calling hours", ist_hour: h });

  const admin = createClient(SUPABASE_URL, SERVICE);
  const now = Date.now();
  const freshAfter = new Date(now - FRESH_WINDOW_HOURS * 3600_000).toISOString();
  const nudgeBefore = new Date(now - NUDGE_AFTER_MIN * 60_000).toISOString();

  // Fresh, assigned, still-open leads whose clock started > NUDGE_AFTER_MIN ago.
  const { data: leads, error } = await admin.from("contacts")
    .select("id, name, phone, salesperson_id, company_id, status, assigned_at, created_at, extra")
    .in("status", ["new", "queued"])
    .not("salesperson_id", "is", null)
    .gte("assigned_at", freshAfter)
    .lte("assigned_at", nudgeBefore)
    .limit(200);
  if (error) return json({ ok: false, error: error.message }, 500);
  if (!leads?.length) return json({ ok: true, checked: 0, nudged: 0, escalated: 0 });

  // One round trip: which of these leads have already been called? Calls are
  // mostly logged by phone (contact_id is often null), so match on either.
  const { data: calls } = await admin.from("call_logs")
    .select("contact_id, phone").gte("created_at", freshAfter).limit(2000);
  const norm = (p: string | null | undefined) => (p ?? "").replace(/\D/g, "").slice(-10);
  const calledIds = new Set((calls ?? []).map((c) => c.contact_id as string | null).filter(Boolean));
  const calledPhones = new Set((calls ?? []).map((c) => norm(c.phone)).filter((p) => p.length >= 7));
  const called = (l: { id: string; phone: string }) => calledIds.has(l.id) || calledPhones.has(norm(l.phone));

  async function push(userId: string, title: string, body: string) {
    if (dry_run) return;
    await fetch(`${SUPABASE_URL}/functions/v1/notify-rep`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE}` },
      body: JSON.stringify({ user_ids: [userId], title, body, channel: "hot_leads" }),
    }).catch((e) => console.error("push failed", e));
  }

  // Bucket per rep so a bulk assignment becomes ONE push, not fifty.
  type L = { id: string; who: string; ageMin: number; extra: Record<string, unknown>; company_id: string };
  const nudge = new Map<string, L[]>();
  const escalate = new Map<string, L[]>();
  let alreadyCalled = 0;

  for (const lead of leads) {
    if (called(lead)) { alreadyCalled++; continue; } // already dialed — SLA met
    const extra = (lead.extra && typeof lead.extra === "object" ? lead.extra : {}) as Record<string, unknown>;
    const stage = typeof extra.sla === "string" ? extra.sla : null;
    if (stage === "escalated") continue; // fully handled
    const ageMin = Math.floor((now - new Date(lead.assigned_at ?? lead.created_at).getTime()) / 60_000);
    const item: L = { id: lead.id, who: lead.name?.trim() || lead.phone, ageMin, extra, company_id: lead.company_id };
    if (ageMin >= ESCALATE_AFTER_MIN && stage === "pinged") {
      const arr = escalate.get(lead.salesperson_id) ?? [];
      arr.push(item);
      escalate.set(lead.salesperson_id, arr);
    } else if (ageMin >= NUDGE_AFTER_MIN && !stage) {
      const arr = nudge.get(lead.salesperson_id) ?? [];
      arr.push(item);
      nudge.set(lead.salesperson_id, arr);
    }
  }

  let nudged = 0, escalated = 0;

  for (const [rep, list] of nudge) {
    nudged += list.length;
    if (!dry_run) {
      for (const l of list) {
        await admin.from("contacts").update({ extra: { ...l.extra, sla: "pinged" } }).eq("id", l.id);
      }
    }
    const oldest = list.reduce((a, b) => (a.ageMin >= b.ageMin ? a : b));
    const body = list.length === 1
      ? `${oldest.who} ko ${oldest.ageMin} min pehle assign hua — pehle 5 minute me call karne wale hi jeette hain. Abhi dial karo!`
      : `${list.length} naye leads abhi tak uncalled hain (sabse purana: ${oldest.who}, ${oldest.ageMin} min). Abhi dial karna shuru karo!`;
    await push(rep, "⏱️ Naya lead thanda ho raha hai", body);
  }

  for (const [rep, list] of escalate) {
    escalated += list.length;
    if (!dry_run) {
      for (const l of list) {
        await admin.from("contacts").update({ extra: { ...l.extra, sla: "escalated" } }).eq("id", l.id);
        await admin.from("lead_activities").insert({
          company_id: l.company_id, contact_id: l.id, actor_id: rep,
          actor_name: "AI Assistant 🤖", type: "sla",
          detail: `⏱️ Lead ${l.ageMin} min tak uncalled raha (5-minute rule breach)`,
        });
      }
    }
    const oldest = list.reduce((a, b) => (a.ageMin >= b.ageMin ? a : b));
    const body = list.length === 1
      ? `${oldest.who} ko ${oldest.ageMin} min ho gaye — abhi call karo, warna lead haath se jayegi.`
      : `${list.length} leads ${ESCALATE_AFTER_MIN}+ min se uncalled hain (sabse purana: ${oldest.who}). Ye ab risk me hain — turant call karo.`;
    await push(rep, "🚨 Lead abhi tak uncalled!", body);
  }

  return json({ ok: true, checked: leads.length, already_called: alreadyCalled, nudged, escalated, dry_run: !!dry_run });
});
