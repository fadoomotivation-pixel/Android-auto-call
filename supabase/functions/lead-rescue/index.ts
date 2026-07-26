// First Reply — keep the customer warm while the rep gets free.
//
// The leak: a lead waits hours for its first call (median 169 min here) and
// dies, because a buyer fills 3-4 forms and goes with whoever answers first.
//
// It does NOT take the lead away from anyone. Ownership is untouched — no
// reassignment, no reshuffling, no commission fights. Instead, when a lead has
// waited past the company's limit, it sends ONE short holding reply on WhatsApp
// IN THE REP'S NAME ("main <rep> bol raha hoon, thodi der me call karta hoon"),
// so the buyer knows they were heard and stops shopping around. The rep still
// owns and still calls; the clock just stops killing the lead.
//
// Bounded and auditable: OFF by default per company, IST calling hours only,
// ONE reply per lead ever, max 25 per run, never on a lead that already has a
// call or an outgoing WhatsApp. Every send is logged to sla_events, the lead's
// Journey and whatsapp_messages, and the rep + manager are told.
//
// Reuses existing rails (whatsapp_integrations, notify-rep, lead_activities) —
// the telecaller app needs NO update. Auth: service role (pg_cron).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GRAPH = "https://graph.facebook.com/v21.0";

const MAX_PER_RUN = 25;
const MAX_AGE_HOURS = 72;

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

  const { data: policies } = await admin.from("sla_policy")
    .select("company_id, enabled, reassign_after_min, notify_admin")
    .eq("enabled", true);
  if (!policies || policies.length === 0) return json({ ok: true, replied: 0, note: "no company has first-reply enabled" });

  let replied = 0, alerted = 0, skipped = 0;
  const done: unknown[] = [];

  for (const pol of policies) {
    const waitMin = Number(pol.reassign_after_min) || 120;
    const cutoff = new Date(Date.now() - waitMin * 60_000).toISOString();
    const floor = new Date(Date.now() - MAX_AGE_HOURS * 3600_000).toISOString();

    // WhatsApp sender for this company (absent = we only alert the manager).
    const { data: integ } = await admin.from("whatsapp_integrations")
      .select("phone_number_id").eq("company_id", pol.company_id).maybeSingle();
    const { data: waToken } = await admin.rpc("get_whatsapp_token", { p_company: pol.company_id });
    const canSend = !!(integ?.phone_number_id && waToken);

    const { data: cands } = await admin.from("contacts")
      .select("id, name, phone, salesperson_id, created_at, status, extra")
      .eq("company_id", pol.company_id)
      .in("status", ["new", "queued"])
      .lt("created_at", cutoff)
      .gt("created_at", floor)
      .limit(120);

    for (const c of cands ?? []) {
      if (replied >= MAX_PER_RUN) break;
      const ex = (c.extra ?? {}) as Record<string, unknown>;
      if (ex.first_reply) { skipped++; continue; } // one holding reply per lead, ever

      // Never speak over a human: any logged call, or any outgoing WhatsApp,
      // means the rep already reached out.
      const [{ count: calls }, { count: msgs }] = await Promise.all([
        admin.from("call_logs").select("id", { count: "exact", head: true }).eq("contact_id", c.id),
        admin.from("whatsapp_messages").select("id", { count: "exact", head: true })
          .eq("contact_id", c.id).eq("direction", "out"),
      ]);
      if ((calls ?? 0) > 0 || (msgs ?? 0) > 0) { skipped++; continue; }

      const waited = Math.round((Date.now() - Date.parse(c.created_at)) / 60000);

      // The reply goes out in the REP'S name — the lead stays theirs.
      let repName = "";
      if (c.salesperson_id) {
        const { data: p } = await admin.from("profiles").select("full_name").eq("id", c.salesperson_id).maybeSingle();
        repName = (p?.full_name as string)?.trim() ?? "";
      }
      const hi = c.name ? `${String(c.name).split(" ")[0]} ji` : "Namaste";
      const text = `${hi}, aapki enquiry mil gayi hai — dhanyavaad! ${repName ? `Main ${repName} hoon` : "Hamari team"} aur thodi hi der me aapko call karke poori details bataunga. Tab tak koi sawaal ho to yahin reply kar dijiye. 🙏`;

      if (dry_run) {
        done.push({ contact: c.id, waited_min: waited, would_send: canSend, text });
        replied++;
        continue;
      }

      let sent = false;
      if (canSend) {
        const r = await fetch(`${GRAPH}/${integ!.phone_number_id}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${waToken}` },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: String(c.phone).replace(/[^0-9]/g, ""),
            type: "text",
            text: { body: text },
          }),
        }).then((x) => x.json()).catch(() => null);
        sent = !!r?.messages;
        if (sent) {
          await admin.from("whatsapp_messages").insert({
            company_id: pol.company_id, contact_id: c.id, direction: "out",
            body: text, status: "sent",
          });
        }
      }

      await admin.from("contacts")
        .update({ extra: { ...ex, first_reply: new Date().toISOString(), first_reply_sent: sent } })
        .eq("id", c.id);

      await admin.from("sla_events").insert({
        company_id: pol.company_id, contact_id: c.id,
        action: sent ? "holding_reply" : "skipped",
        from_rep: c.salesperson_id, waited_min: waited,
        detail: sent
          ? `No call for ${waited} min — sent a holding WhatsApp in ${repName || "the team"}'s name. Lead still belongs to the same telecaller.`
          : `No call for ${waited} min — WhatsApp not configured, so only the manager was told. Lead untouched.`,
      });

      if (sent) {
        await admin.from("lead_activities").insert({
          company_id: pol.company_id, contact_id: c.id, actor_name: "AI Assistant", type: "update",
          detail: `Auto first-reply: ${waited} min tak call nahi hui, isliye customer ko aapke naam se WhatsApp bhej diya — lead aapke paas hi hai, ab call kar lijiye.`,
        });
        replied++;
        done.push({ contact: c.id, waited_min: waited });
      } else {
        skipped++;
      }

      // A human is always told — the rep (it is still their lead) and the manager.
      const notify: string[] = [];
      if (c.salesperson_id) notify.push(c.salesperson_id as string);
      if (pol.notify_admin) {
        const { data: admins } = await admin.from("profiles")
          .select("id").eq("company_id", pol.company_id).eq("role", "admin").limit(3);
        for (const a of admins ?? []) notify.push(a.id as string);
      }
      if (notify.length) {
        await fetch(`${SUPABASE_URL}/functions/v1/notify-rep`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE}` },
          body: JSON.stringify({
            user_ids: notify,
            title: sent ? "💬 Customer ko hold kar liya — ab call kijiye" : "⏱️ Lead abhi tak uncalled",
            body: `${c.name || c.phone}: ${waited} min se koi call nahi${sent ? ". WhatsApp bhej diya hai, lead aapke paas hi hai." : "."}`,
            channel: "hot_leads",
          }),
        }).catch(() => {});
        alerted++;
      }
    }
  }

  return json({ ok: true, replied, alerted, skipped, dry_run: !!dry_run, actions: done.slice(0, 25) });
});
