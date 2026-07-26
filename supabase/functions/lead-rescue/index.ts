// Auto-Rescue — the accountability loop.
//
// lead-sla nudges the rep, escalates once, and stops. If the rep still doesn't
// call, nothing moves the lead — which is how 55% of leads ended up never
// called. This takes the step a human manager would: after the company's own
// threshold, hand the lead to a DIFFERENT rep and tell the manager.
//
// It acts on real customer data, so it is deliberately bounded:
//   • OFF by default — each company's admin must switch it on (sla_policy),
//   • only inside IST calling hours, only leads that got a real chance,
//   • at most MAX_PER_RUN moves per run, one rescue per lead ever,
//   • every action written to sla_events + the lead's Journey, so a human can
//     see exactly what was done and undo it.
// It never contacts a customer itself — it only makes sure a human does.
//
// Reuses existing rails (notify-rep push, lead_activities journal, fb_pick_rep)
// so the telecaller app needs NO update. Auth: service role (pg_cron).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const MAX_PER_RUN = 25;
const MAX_AGE_HOURS = 72; // older than this is the forgotten-lead job, not a rescue

const json = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });

const istHour = () => new Date(Date.now() + 5.5 * 3600 * 1000).getUTCHours();

Deno.serve(async (req) => {
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (bearer !== SERVICE) return json({ ok: false, error: "service only" }, 401);
  const { dry_run } = await req.json().catch(() => ({}));

  const h = istHour();
  if (h < 9 || h >= 20) return json({ ok: true, skipped: "outside calling hours", ist_hour: h });

  const admin = createClient(SUPABASE_URL, SERVICE);

  // Only companies that switched this on.
  const { data: policies } = await admin.from("sla_policy")
    .select("company_id, enabled, reassign_after_min, notify_admin")
    .eq("enabled", true);
  if (!policies || policies.length === 0) return json({ ok: true, rescued: 0, note: "no company has auto-rescue enabled" });

  let rescued = 0, alerted = 0, skipped = 0;
  const done: unknown[] = [];

  for (const pol of policies) {
    const waitMin = Number(pol.reassign_after_min) || 120;
    const cutoff = new Date(Date.now() - waitMin * 60_000).toISOString();
    const floor = new Date(Date.now() - MAX_AGE_HOURS * 3600_000).toISOString();

    const { data: cands } = await admin.from("contacts")
      .select("id, name, phone, salesperson_id, created_at, status, extra")
      .eq("company_id", pol.company_id)
      .in("status", ["new", "queued"])
      .lt("created_at", cutoff)
      .gt("created_at", floor)
      .limit(120);

    for (const c of cands ?? []) {
      if (rescued >= MAX_PER_RUN) break;
      const ex = (c.extra ?? {}) as Record<string, unknown>;
      if (ex.rescued) { skipped++; continue; } // one rescue per lead, ever

      // Still genuinely uncalled? (a real call at any time disqualifies it)
      const { count } = await admin.from("call_logs")
        .select("id", { count: "exact", head: true })
        .eq("contact_id", c.id);
      if ((count ?? 0) > 0) { skipped++; continue; }

      const waited = Math.round((Date.now() - Date.parse(c.created_at)) / 60000);

      // Hand it to a different rep. If the company has nobody else, don't
      // shuffle it pointlessly — just tell the manager.
      const { data: pick } = await admin.rpc("fb_pick_rep", { p_company: pol.company_id });
      const newRep = pick && pick !== c.salesperson_id ? (pick as string) : null;

      if (dry_run) {
        done.push({ contact: c.id, waited_min: waited, would_move_to: newRep });
        rescued++;
        continue;
      }

      if (newRep) {
        const { error } = await admin.from("contacts")
          .update({
            salesperson_id: newRep,
            assigned_at: new Date().toISOString(),
            extra: { ...ex, rescued: new Date().toISOString(), rescued_from: c.salesperson_id },
          })
          .eq("id", c.id);
        if (error) { skipped++; continue; }

        await admin.from("sla_events").insert({
          company_id: pol.company_id, contact_id: c.id, action: "reassigned",
          from_rep: c.salesperson_id, to_rep: newRep, waited_min: waited,
          detail: `Uncalled for ${waited} min — moved to another telecaller.`,
        });
        await admin.from("lead_activities").insert({
          company_id: pol.company_id, contact_id: c.id, actor_name: "AI Assistant", type: "update",
          detail: `Auto-rescue: is lead pe ${waited} min tak koi call nahi hui, isliye doosre telecaller ko de diya gaya.`,
        });
        await fetch(`${SUPABASE_URL}/functions/v1/notify-rep`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE}` },
          body: JSON.stringify({
            user_ids: [newRep],
            title: "🛠 Rescue lead — abhi call kijiye",
            body: `${c.name || c.phone} pe ${waited} min se koi call nahi hui. Ab ye aapka lead hai.`,
            channel: "hot_leads",
          }),
        }).catch(() => {});
        rescued++;
        done.push({ contact: c.id, waited_min: waited, moved_to: newRep });
      } else {
        await admin.from("sla_events").insert({
          company_id: pol.company_id, contact_id: c.id, action: "skipped",
          from_rep: c.salesperson_id, waited_min: waited,
          detail: `Uncalled for ${waited} min but no other telecaller available to take it.`,
        });
        skipped++;
      }

      // Tell the manager — a human stays in the loop on every move.
      if (pol.notify_admin) {
        const { data: admins } = await admin.from("profiles")
          .select("id").eq("company_id", pol.company_id).eq("role", "admin").limit(3);
        const ids = (admins ?? []).map((a) => a.id);
        if (ids.length) {
          await fetch(`${SUPABASE_URL}/functions/v1/notify-rep`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE}` },
            body: JSON.stringify({
              user_ids: ids,
              title: "⚠️ Lead SLA miss",
              body: `${c.name || c.phone}: ${waited} min tak koi call nahi hui${newRep ? " — doosre telecaller ko de diya" : " — koi doosra telecaller free nahi"}.`,
              channel: "hot_leads",
            }),
          }).catch(() => {});
          await admin.from("sla_events").insert({
            company_id: pol.company_id, contact_id: c.id, action: "admin_alerted",
            waited_min: waited, detail: "Manager notified of the SLA miss.",
          });
          alerted++;
        }
      }
    }
  }

  return json({ ok: true, rescued, alerted, skipped, dry_run: !!dry_run, actions: done.slice(0, 25) });
});
