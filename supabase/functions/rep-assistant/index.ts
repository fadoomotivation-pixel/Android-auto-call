// The telecaller's AI assistant pushes, fired by pg_cron (see migration 0048):
//   task=agenda  (9:30 IST daily)   — "Aaj ka plan" morning brief: callbacks due
//                                     today, site visits, overdue follow-ups, hot
//                                     leads. Tap opens the Leads page (open_tab).
//   task=guard   (12:00 IST daily)  — bhoola-lead guard: interested leads
//                                     untouched for 3+ days → nudge.
//   task=quote   (11:00 & 16:00 IST)— a fresh AI-generated sales
//                                     funda for a random telecaller per company
//                                     — har baar alag (random theme + high temp).
// Auth: service role only (cron). Secrets: GROQ_API_KEY (for quotes).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GROQ = Deno.env.get("GROQ_API_KEY") ?? "";

function json(o: unknown, s = 200) {
  return new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });
}

// IST helpers.
const IST = "+05:30";
function istDate(offsetDays = 0): string {
  return new Date(Date.now() + 5.5 * 3600 * 1000 + offsetDays * 86400 * 1000).toISOString().slice(0, 10);
}
function istDayStartIso(offsetDays = 0): string {
  return new Date(`${istDate(offsetDays)}T00:00:00${IST}`).toISOString();
}
function istTime(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 5.5 * 3600 * 1000);
  const h = d.getUTCHours(), m = d.getUTCMinutes();
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

const QUOTE_THEMES = [
  "follow-up discipline — the money is in the follow-up",
  "build trust in the first 30 seconds",
  "listen to the customer, don't push your script",
  "turn an objection into a chance (budget, location, price)",
  "fixing a site visit is the real win",
  "bounce back from a no — the next call is a new chance",
  "create urgency without sounding pushy",
  "use WhatsApp follow-up well",
  "the first 2 hours of the day are the most productive",
  "never leave a hot lead for tomorrow",
  "the telecaller who writes notes is the one who wins",
  "a smile in your voice — the customer can hear it",
  "small yeses lead to a big deal",
  "consistency beats talent — 50 dials a day",
];

Deno.serve(async (req) => {
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (bearer !== SERVICE) return json({ ok: false, error: "service only" }, 401);
  const admin = createClient(SUPABASE_URL, SERVICE);
  const { task } = await req.json().catch(() => ({}));

  // Telecallers who actually have a device registered.
  const { data: toks } = await admin.from("device_tokens").select("user_id");
  const userIds = [...new Set((toks ?? []).map((t) => t.user_id as string))];
  if (!userIds.length) return json({ ok: true, sent: 0, note: "no devices" });
  const { data: reps } = await admin.from("profiles")
    .select("id, full_name, company_id, role").in("id", userIds).eq("role", "salesperson");
  if (!reps?.length) return json({ ok: true, sent: 0, note: "no telecallers" });

  async function push(userId: string, title: string, body: string, channel: string, data?: Record<string, string>) {
    await fetch(`${SUPABASE_URL}/functions/v1/notify-rep`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE}` },
      body: JSON.stringify({ user_ids: [userId], title, body, channel, ...(data ? { data } : {}) }),
    }).catch((e) => console.error("push failed", e));
  }

  let sent = 0;

  if (task === "agenda") {
    const dayStart = istDayStartIso(0), dayEnd = istDayStartIso(1);
    for (const rep of reps) {
      const [fu, od, sv, hot] = await Promise.all([
        admin.from("follow_ups").select("name, phone, due_at").eq("salesperson_id", rep.id)
          .eq("status", "pending").gte("due_at", dayStart).lt("due_at", dayEnd)
          .order("due_at", { ascending: true }).limit(25),
        admin.from("follow_ups").select("id", { count: "exact", head: true })
          .eq("salesperson_id", rep.id).eq("status", "pending").lt("due_at", dayStart),
        admin.from("contacts").select("name, phone").eq("salesperson_id", rep.id)
          .gte("site_visit_at", dayStart).lt("site_visit_at", dayEnd).limit(5),
        admin.from("contacts").select("id", { count: "exact", head: true })
          .eq("salesperson_id", rep.id).eq("temperature", "hot")
          .not("status", "in", "(booked,lost,not_interested,dnc)"),
      ]);
      const fus = fu.data ?? [], svs = sv.data ?? [];
      const overdue = od.count ?? 0, hotN = hot.count ?? 0;
      const parts: string[] = [];
      if (fus.length) {
        const first = fus[0];
        parts.push(`${fus.length} callback${fus.length > 1 ? "s" : ""} (first: ${first.name ?? first.phone}, ${istTime(first.due_at)})`);
      }
      if (svs.length) parts.push(`${svs.length} site visit — ${svs.map((s) => s.name ?? s.phone).join(", ")}`);
      if (overdue) parts.push(`${overdue} overdue follow-up${overdue > 1 ? "s" : ""} to clear`);
      if (hotN) parts.push(`${hotN} hot lead${hotN > 1 ? "s" : ""} ready`);
      const body = parts.length
        ? `Today: ${parts.join(" · ")}`
        : "Board is clear. Start dialling new leads today. 🚀";
      // Tap → straight to the Leads page (open_tab deep-link).
      await push(rep.id, "☀️ Today's plan", body, "agenda", { open_tab: "leads" });
      sent++;
    }
  } else if (task === "guard") {
    const cutoff = new Date(Date.now() - 3 * 86400 * 1000).toISOString();
    for (const rep of reps) {
      const { data: stale } = await admin.from("contacts")
        .select("name, phone, updated_at").eq("salesperson_id", rep.id)
        .in("status", ["interested", "negotiation"]).lt("updated_at", cutoff)
        .order("updated_at", { ascending: true }).limit(25);
      if (!stale?.length) continue;
      const names = stale.slice(0, 3).map((c) => c.name ?? c.phone).join(", ");
      const more = stale.length > 3 ? ` +${stale.length - 3} more` : "";
      await push(
        rep.id,
        "🕳️ Forgotten leads",
        `${stale.length} interested lead${stale.length > 1 ? "s" : ""} not touched for 3+ days: ${names}${more}. Call them today. A warm lead goes cold.`,
        "followups",
        { open_tab: "leads" },
      );
      sent++;
    }
  } else if (task === "quote") {
    if (!GROQ) return json({ ok: false, error: "GROQ_API_KEY missing" }, 500);
    // One random telecaller per company gets today's funda.
    const byCompany = new Map<string, typeof reps>();
    for (const r of reps) {
      const k = r.company_id ?? "none";
      byCompany.set(k, [...(byCompany.get(k) ?? []), r]);
    }
    for (const group of byCompany.values()) {
      const rep = group[Math.floor(Math.random() * group.length)];
      const theme = QUOTE_THEMES[Math.floor(Math.random() * QUOTE_THEMES.length)];
      const ch = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST", headers: { Authorization: `Bearer ${GROQ}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: (Deno.env.get("GROQ_MODEL") ?? "openai/gpt-oss-120b"), temperature: 1.1,
          messages: [
            {
              role: "system",
              content: "You write ONE short, punchy motivational tip for an Indian real-estate " +
                "telecaller. Simple Indian English, max 22 words, practical and " +
                "energetic — something they can USE on the very next call. No hashtags, no " +
                "surrounding quote marks, no emojis, no preamble. Never repeat standard clichés.",
            },
            { role: "user", content: `Theme: ${theme}. Write today's tip in simple English.` },
          ],
        }),
      });
      const chj = await ch.json();
      const quote: string = (chj.choices?.[0]?.message?.content ?? "").trim();
      if (!quote) continue;
      await push(rep.id, "💡 Today's tip", quote.slice(0, 220), "quotes");
      sent++;
    }
  } else {
    return json({ ok: false, error: "unknown task" }, 400);
  }

  return json({ ok: true, task, sent });
});
