// The telecaller's AI assistant pushes, fired by pg_cron (see migration 0048):
//   task=agenda  (10:00 IST daily)  — "Aaj ka plan": callbacks due today, site
//                                     visits, overdue follow-ups, hot leads.
//   task=guard   (12:00 IST daily)  — bhoola-lead guard: interested leads
//                                     untouched for 3+ days → nudge.
//   task=quote   (11:00 & 16:00 IST)— ek fresh AI-generated Hinglish sales
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
  "follow-up discipline — paisa follow-up me hai",
  "pehle 30 seconds me trust banana",
  "customer ki sunna, apni script nahi thopna",
  "objection ko opportunity banana (budget/location/price)",
  "site visit fix karna hi asli jeet hai",
  "rejection se bounce-back — agla call naya mauka",
  "urgency banana bina pushy lage",
  "WhatsApp follow-up ka smart use",
  "din ke pehle 2 ghante sabse productive",
  "hot lead ko kabhi kal pe mat chhodo",
  "notes likhne wala telecaller hamesha jeetta hai",
  "awaaz me muskaan — customer ko sunai deti hai",
  "chhote commitments se bada sauda (micro-yes)",
  "consistency beats talent — roz ke 50 dials",
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

  async function push(userId: string, title: string, body: string, channel: string) {
    await fetch(`${SUPABASE_URL}/functions/v1/notify-rep`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE}` },
      body: JSON.stringify({ user_ids: [userId], title, body, channel }),
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
        parts.push(`${fus.length} callback${fus.length > 1 ? "s" : ""} (pehla: ${first.name ?? first.phone}, ${istTime(first.due_at)})`);
      }
      if (svs.length) parts.push(`${svs.length} site visit — ${svs.map((s) => s.name ?? s.phone).join(", ")}`);
      if (overdue) parts.push(`${overdue} overdue follow-up${overdue > 1 ? "s" : ""} clear karo`);
      if (hotN) parts.push(`${hotN} hot lead${hotN > 1 ? "s" : ""} ready`);
      const body = parts.length
        ? `Aaj: ${parts.join(" · ")}`
        : "Board clean hai — aaj naye leads pe dial start karo 🚀";
      await push(rep.id, "☀️ Aaj ka plan", body, "agenda");
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
      const more = stale.length > 3 ? ` +${stale.length - 3} aur` : "";
      await push(
        rep.id,
        "🕳️ Bhoole hue leads",
        `${stale.length} interested lead${stale.length > 1 ? "s" : ""} ko 3+ din se touch nahi kiya: ${names}${more}. Aaj call karo — warm lead thanda ho jata hai.`,
        "followups",
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
          model: "llama-3.3-70b-versatile", temperature: 1.1,
          messages: [
            {
              role: "system",
              content: "You write ONE short, punchy motivational tip for an Indian real-estate " +
                "telecaller. Hinglish (Roman Hindi + English mix), max 22 words, practical and " +
                "energetic — something they can USE on the very next call. No hashtags, no " +
                "surrounding quote marks, no emojis, no preamble. Never repeat standard clichés.",
            },
            { role: "user", content: `Theme: ${theme}. Aaj ka funda likho.` },
          ],
        }),
      });
      const chj = await ch.json();
      const quote: string = (chj.choices?.[0]?.message?.content ?? "").trim();
      if (!quote) continue;
      await push(rep.id, "💡 Aaj ka funda", quote.slice(0, 220), "quotes");
      sent++;
    }
  } else {
    return json({ ok: false, error: "unknown task" }, 400);
  }

  return json({ ok: true, task, sent });
});
