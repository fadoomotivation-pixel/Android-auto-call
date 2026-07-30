// Team Pulse — "Aaj kiski pipeline me kya hua", built for the company owner /
// super-admin to see (and forward) at a glance what each telecaller did today.
// Assembles per-rep activity for a day (calls, voice notes + their AI summaries,
// pipeline moves incl. AI-Assistant auto-actions, site visits, follow-ups) and
// writes ONE crisp AI narrative per rep + a company headline.
//
// Body: { date?: "YYYY-MM-DD" (IST), company_id?: uuid (super-admin only) }
// Auth: company admin (JWT, scoped to own company) or super-admin (any/all).
// Secret: GROQ_API_KEY.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(o: unknown, s = 200) {
  return new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
}
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GROQ = Deno.env.get("GROQ_API_KEY") ?? "";

const IST_MS = 5.5 * 3600 * 1000;
function istDate(offset = 0): string {
  return new Date(Date.now() + IST_MS + offset * 86400_000).toISOString().slice(0, 10);
}
function dayBounds(dateIst: string): { start: string; end: string } {
  return { start: `${dateIst}T00:00:00+05:30`, end: `${dateIst}T23:59:59+05:30` };
}
function fmtDur(sec: number): string {
  const m = Math.floor(sec / 60), s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

type RepPulse = {
  id: string;
  name: string;
  calls: number;
  connected: number;
  talkSeconds: number;
  voiceNotes: { summary: string | null; lead: string; disposition: string | null; audioPath: string | null }[];
  moves: { detail: string; lead: string; byAi: boolean }[];
  siteVisits: string[];
  followUps: number;
  hotLeads: number;
  narrative?: string;
};

async function buildCompany(admin: SupabaseClient, companyId: string, date: string) {
  const { start, end } = dayBounds(date);

  const { data: reps } = await admin.from("profiles")
    .select("id, full_name").eq("company_id", companyId).eq("role", "salesperson");
  const repList = reps ?? [];
  const nameById = new Map(repList.map((r) => [r.id, r.full_name || "Telecaller"]));

  // Contact names for pretty labels.
  const { data: contacts } = await admin.from("contacts")
    .select("id, name, phone").eq("company_id", companyId);
  const leadName = new Map((contacts ?? []).map((c) => [c.id, c.name || c.phone || "lead"]));

  const [calls, notes, acts, visits, fups, hot] = await Promise.all([
    // started_at, not created_at: the phone's call-log sync backfills a week of
    // history the first time it runs, and every one of those rows is created
    // TODAY — which reported a whole week as one day's work. off_crm calls are
    // the rep's own and never counted as work.
    admin.from("call_logs").select("salesperson_id, outcome, duration_seconds")
      .eq("company_id", companyId).gte("started_at", start).lte("started_at", end)
      .or("off_crm.is.null,off_crm.eq.false"),
    admin.from("lead_voice_notes").select("actor_id, contact_id, summary, suggested_disposition, audio_path")
      .eq("company_id", companyId).gte("created_at", start).lte("created_at", end),
    admin.from("lead_activities").select("actor_id, actor_name, contact_id, detail, type")
      .eq("company_id", companyId).gte("created_at", start).lte("created_at", end)
      .in("type", ["status", "site_visit", "follow_up", "budget", "temperature"]),
    admin.from("contacts").select("salesperson_id, name, phone, site_visit_at")
      .eq("company_id", companyId).gte("site_visit_at", start).lte("site_visit_at", end),
    admin.from("follow_ups").select("salesperson_id").eq("company_id", companyId)
      .gte("created_at", start).lte("created_at", end),
    admin.from("contacts").select("salesperson_id").eq("company_id", companyId)
      .eq("temperature", "hot").not("status", "in", "(booked,lost,not_interested,dnc)"),
  ]);

  const map = new Map<string, RepPulse>();
  const rep = (id: string | null): RepPulse | null => {
    if (!id || !nameById.has(id)) return null;
    if (!map.has(id)) {
      map.set(id, {
        id, name: nameById.get(id)!, calls: 0, connected: 0, talkSeconds: 0,
        voiceNotes: [], moves: [], siteVisits: [], followUps: 0, hotLeads: 0,
      });
    }
    return map.get(id)!;
  };

  for (const c of calls.data ?? []) {
    const r = rep(c.salesperson_id); if (!r) continue;
    r.calls++; if (c.outcome === "connected") r.connected++;
    r.talkSeconds += c.duration_seconds ?? 0;
  }
  for (const n of notes.data ?? []) {
    const r = rep(n.actor_id); if (!r) continue;
    r.voiceNotes.push({
      summary: n.summary, lead: leadName.get(n.contact_id) ?? "lead",
      disposition: n.suggested_disposition, audioPath: n.audio_path ?? null,
    });
  }
  for (const a of acts.data ?? []) {
    const r = rep(a.actor_id); if (!r) continue;
    r.moves.push({ detail: a.detail, lead: leadName.get(a.contact_id) ?? "lead", byAi: (a.actor_name ?? "").includes("AI") });
  }
  for (const v of visits.data ?? []) {
    const r = rep(v.salesperson_id); if (!r) continue;
    r.siteVisits.push(v.name || v.phone || "lead");
  }
  for (const f of fups.data ?? []) { const r = rep(f.salesperson_id); if (r) r.followUps++; }
  for (const h of hot.data ?? []) { const r = rep(h.salesperson_id); if (r) r.hotLeads++; }

  // Include reps with zero activity too (owner wants to see who was idle).
  for (const rp of repList) rep(rp.id);

  const pulses = [...map.values()].sort((a, b) => (b.calls + b.voiceNotes.length) - (a.calls + a.voiceNotes.length));

  // AI narrative per rep (skip if no signal — keep it cheap and honest).
  if (GROQ) {
    await Promise.all(pulses.map(async (p) => {
      const active = p.calls || p.voiceNotes.length || p.moves.length || p.siteVisits.length;
      if (!active) { p.narrative = "Aaj koi activity nahi — check in with them."; return; }
      const facts = {
        rep: p.name, calls: p.calls, connected: p.connected, talk: fmtDur(p.talkSeconds),
        site_visits: p.siteVisits, follow_ups: p.followUps, hot_leads: p.hotLeads,
        pipeline_moves: p.moves.slice(0, 12).map((m) => `${m.lead}: ${m.detail}${m.byAi ? " [AI]" : ""}`),
        // Only notes that actually say something. Feeding "(processing)" or an
        // empty note in is how filler lines ended up in a founder's WhatsApp.
        voice_note_summaries: p.voiceNotes
          .filter((v) => (v.summary ?? "").trim().length > 3 && !/^empty note$/i.test((v.summary ?? "").trim()))
          .slice(0, 8).map((v) => `${v.lead}: ${v.summary}`),
      };
      const ch = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST", headers: { Authorization: `Bearer ${GROQ}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile", temperature: 0.4,
          messages: [
            {
              role: "system",
              content: "You brief a real-estate company FOUNDER on ONE telecaller's day. " +
                "This is forwarded as-is on WhatsApp, so every line has to earn its place.\n" +
                "Write 2-3 short sentences. Simple English with the odd everyday Hindi word is " +
                "fine; no formal Hindi, no markdown, no preamble, no sign-off.\n" +
                "NEVER repeat the call/connected/talk-time numbers — they are already printed " +
                "directly above your text, and repeating them is the first thing the owner " +
                "deletes. Skip anything with no real content (an empty or unprocessed note is " +
                "not news). Do not describe the same lead move twice.\n" +
                "Spend the words on what a founder cannot see from the numbers: which deals " +
                "actually moved and why, what is at risk, and the single most important next " +
                "step — with the lead's name.",
            },
            { role: "user", content: JSON.stringify(facts) },
          ],
        }),
      });
      const cj = await ch.json();
      p.narrative = (cj.choices?.[0]?.message?.content ?? "").trim() || undefined;
    }));
  }

  const totals = pulses.reduce((t, p) => ({
    calls: t.calls + p.calls, connected: t.connected + p.connected,
    notes: t.notes + p.voiceNotes.length, visits: t.visits + p.siteVisits.length,
  }), { calls: 0, connected: 0, notes: 0, visits: 0 });

  return { date, totals, reps: pulses };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const auth = req.headers.get("Authorization") ?? "";
  const admin = createClient(SUPABASE_URL, SERVICE);

  const u = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
  const { data: ud } = await u.auth.getUser();
  if (!ud?.user) return json({ ok: false, error: "Unauthorized" }, 401);
  const [{ data: me }, { data: pa }] = await Promise.all([
    admin.from("profiles").select("role, company_id").eq("id", ud.user.id).maybeSingle(),
    admin.from("platform_admins").select("user_id").eq("user_id", ud.user.id).maybeSingle(),
  ]);
  const isSuper = !!pa;
  if (me?.role !== "admin" && !isSuper) return json({ ok: false, error: "Managers only" }, 403);

  const body = await req.json().catch(() => ({}));
  const date = typeof body?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : istDate(0);

  let companyIds: string[];
  if (isSuper && body?.company_id) companyIds = [body.company_id];
  else if (isSuper) {
    const { data: cs } = await admin.from("companies").select("id");
    companyIds = (cs ?? []).map((c) => c.id);
  } else {
    if (!me?.company_id) return json({ ok: false, error: "No company" }, 400);
    companyIds = [me.company_id];
  }

  const nameById = new Map<string, string>();
  if (isSuper) {
    const { data: cs } = await admin.from("companies").select("id, name");
    for (const c of cs ?? []) nameById.set(c.id, c.name);
  }

  const companies = [];
  for (const cid of companyIds.slice(0, 20)) {
    const pulse = await buildCompany(admin, cid, date);
    companies.push({ company_id: cid, company_name: nameById.get(cid) ?? null, ...pulse });
  }

  return json({ ok: true, date, companies });
});
