// Who each telecaller is, as her own calls and chats show it.
//
// The founder's words: "har telecallers k call recording sun k ek persona banta
// rahe". The drafter already copied a rep's voice from her last few WhatsApp
// messages; it did not know how she SELLS — what she leads with, what she is
// good at, where calls slip away. This reads her recent recorded calls (each
// already summarised, some rated by the coach) and her own outgoing messages,
// and writes that down once a night. follow-up-draft writes in that voice, and
// the founder can read it on the AI Coach page.
//
// Her phrases are kept only if she really wrote them: every one is checked
// against her own messages, so a persona can never put words in her mouth.
//
//   cron (service key)  { mode: "build", limit }    reps with new calls since the last build
//   admin (JWT)         { mode: "get" | "rebuild", salesperson_id }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { groqJson } from "../_shared/groq.ts";

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

/** Fewer than this and it is a guess about a person, not a description of one. */
const MIN_CALLS = 5;
const DAYS = 21;

const SYSTEM =
  "You describe ONE Indian real-estate telecaller from short notes on her own recorded calls and her own " +
  "WhatsApp messages. The founder reads this, and an assistant uses it to write messages in her voice. " +
  'Reply ONLY as JSON: {"summary": string, "how_she_sounds": string, "how_she_sells": string, ' +
  '"strengths": string[], "watch_out": string[], "her_phrases": string[]}. ' +
  "summary: one line, max 20 words, who she is on the phone. " +
  "how_she_sounds: max 25 words — her tone and language mix (Hindi, English, Hinglish), formal or friendly, " +
  "how she greets and signs off, taken from her messages. " +
  "how_she_sells: max 30 words — what she leads with, which projects or offers she talks about, how she " +
  "tries to get a site visit. " +
  "strengths: 2 or 3 things she does well, max 12 words each, each one seen in the notes. " +
  "watch_out: 1 or 2 things that cost her deals, max 14 words each, said kindly. " +
  "her_phrases: 3 to 6 short phrases COPIED EXACTLY from her own WhatsApp messages, as she wrote them. " +
  "Simple everyday English for everything except her_phrases. Only what the notes show. Never invent.";

type Rep = { id: string; company_id: string; full_name: string | null };

async function build(admin: SupabaseClient, rep: Rep): Promise<{ ok: boolean; error?: string; persona?: unknown }> {
  const since = new Date(Date.now() - DAYS * 86400_000).toISOString();
  const [{ data: calls }, { data: msgs }] = await Promise.all([
    admin.from("call_logs")
      .select("started_at, duration_seconds, summary, suggested_disposition, coach_feedback(rating, good, improve)")
      .eq("salesperson_id", rep.id).gte("started_at", since).gte("duration_seconds", 45)
      .not("summary", "is", null).order("duration_seconds", { ascending: false }).limit(25),
    admin.from("wa_observed_messages")
      .select("body").eq("salesperson_id", rep.id).eq("direction", "out").is("archived_at", null)
      .not("body", "is", null).order("sent_at", { ascending: false }).limit(120),
  ]);
  const callRows = (calls ?? []) as Array<{
    started_at: string; duration_seconds: number; summary: string; suggested_disposition: string | null;
    coach_feedback: { rating: number | null; good: string | null; improve: string | null }
      | { rating: number | null; good: string | null; improve: string | null }[] | null;
  }>;
  if (callRows.length < MIN_CALLS) return { ok: false, error: `Only ${callRows.length} recorded calls in ${DAYS} days.` };

  const mine = [...new Set(((msgs ?? []) as { body: string }[])
    .map((m) => String(m.body ?? "").trim()).filter((t) => t.length >= 20 && t.length <= 400))].slice(0, 30);

  const callLines = callRows.map((c, i) => {
    const fb = Array.isArray(c.coach_feedback) ? c.coach_feedback[0] : c.coach_feedback;
    return [
      `Call ${i + 1} · ${Math.max(1, Math.round(c.duration_seconds / 60))} min`,
      c.suggested_disposition ? `result: ${c.suggested_disposition}` : "",
      String(c.summary).replace(/\s+/g, " ").slice(0, 280),
      fb?.rating ? `coach ${fb.rating}/5` : "",
      fb?.good ? `coach liked: ${String(fb.good).slice(0, 120)}` : "",
      fb?.improve ? `coach said improve: ${String(fb.improve).slice(0, 120)}` : "",
    ].filter(Boolean).join(" · ");
  });

  const out = await groqJson<Record<string, unknown>>(SYSTEM,
    `Telecaller: ${rep.full_name ?? "telecaller"}\n\nHER RECORDED CALLS:\n${callLines.join("\n")}\n\n` +
    (mine.length ? `HER OWN WHATSAPP MESSAGES:\n${mine.map((m) => `- ${m}`).join("\n")}` : "HER OWN WHATSAPP MESSAGES: none captured."),
    0.3);
  if (!out.data) return { ok: false, error: out.error ?? "The coach did not answer." };

  const str = (v: unknown, n: number) => typeof v === "string" ? v.trim().slice(0, n) : "";
  const list = (v: unknown, k: number, n: number) =>
    (Array.isArray(v) ? v : []).map((x) => str(x, n)).filter(Boolean).slice(0, k);
  // Only words she really wrote. Matched loosely on spacing and case, never on content.
  const norm = (t: string) => t.toLowerCase().replace(/\s+/g, " ");
  const corpus = norm(mine.join("\n"));
  const persona = {
    summary: str(out.data.summary, 200),
    how_she_sounds: str(out.data.how_she_sounds, 260),
    how_she_sells: str(out.data.how_she_sells, 300),
    strengths: list(out.data.strengths, 3, 120),
    watch_out: list(out.data.watch_out, 2, 140),
    her_phrases: list(out.data.her_phrases, 6, 80).filter((p) => corpus.includes(norm(p))),
  };
  if (!persona.summary) return { ok: false, error: "The answer was empty." };

  await admin.from("rep_personas").upsert({
    salesperson_id: rep.id,
    company_id: rep.company_id,
    persona,
    built_from: { calls: callRows.length, messages: mine.length },
    model: out.model,
    built_at: new Date().toISOString(),
  });
  return { ok: true, persona };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const admin = createClient(SUPABASE_URL, SERVICE);

  // ---- nightly: the reps who made new recorded calls since their last build ----
  if (bearer === SERVICE) {
    if (body.mode !== "build") return json({ ok: false, error: "unknown service mode" }, 400);
    const limit = Math.min(Math.max(Number(body.limit) || 3, 1), 6);
    const since = new Date(Date.now() - DAYS * 86400_000).toISOString();
    const { data: recent } = await admin.from("call_logs")
      .select("salesperson_id, started_at")
      .gte("started_at", since).gte("duration_seconds", 45).not("summary", "is", null)
      .not("salesperson_id", "is", null).order("started_at", { ascending: false }).limit(1000);
    const latest = new Map<string, { n: number; last: string }>();
    for (const r of (recent ?? []) as { salesperson_id: string; started_at: string }[]) {
      const e = latest.get(r.salesperson_id) ?? { n: 0, last: r.started_at };
      e.n++;
      latest.set(r.salesperson_id, e);
    }
    const ids = [...latest.entries()].filter(([, e]) => e.n >= MIN_CALLS).map(([id]) => id);
    if (!ids.length) return json({ ok: true, built: 0 });
    const [{ data: built }, { data: reps }] = await Promise.all([
      admin.from("rep_personas").select("salesperson_id, built_at").in("salesperson_id", ids),
      admin.from("profiles").select("id, company_id, full_name").in("id", ids).eq("role", "salesperson"),
    ]);
    const builtAt = new Map(((built ?? []) as { salesperson_id: string; built_at: string }[])
      .map((b) => [b.salesperson_id, b.built_at]));
    // New calls since the last build, or never built. Everyone else is unchanged.
    const due = ((reps ?? []) as Rep[])
      .filter((r) => !builtAt.has(r.id) || latest.get(r.id)!.last > builtAt.get(r.id)!)
      .slice(0, limit);
    let ok = 0, failed = 0;
    for (const r of due) {
      const b = await build(admin, r).catch((e) => ({ ok: false, error: String(e) }));
      if (b.ok) ok++; else failed++;
    }
    return json({ ok: true, built: ok, failed });
  }

  // ---- admin: read or rebuild one telecaller's persona ----
  const u = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: `Bearer ${bearer}` } } });
  const { data: ud } = await u.auth.getUser();
  if (!ud?.user) return json({ ok: false, error: "Unauthorized" }, 401);
  const [{ data: me }, { data: pa }] = await Promise.all([
    admin.from("profiles").select("role, company_id").eq("id", ud.user.id).maybeSingle(),
    admin.from("platform_admins").select("user_id").eq("user_id", ud.user.id).maybeSingle(),
  ]);
  if (me?.role !== "admin" && !pa) return json({ ok: false, error: "Admins only" }, 403);

  const { data: rep } = await admin.from("profiles").select("id, company_id, full_name")
    .eq("id", String(body.salesperson_id ?? "")).maybeSingle();
  if (!rep) return json({ ok: false, error: "No such telecaller." }, 404);
  if (!pa && rep.company_id !== me?.company_id) return json({ ok: false, error: "Not your company." }, 403);

  if (body.mode === "rebuild") {
    const b = await build(admin, rep as Rep);
    if (!b.ok) return json({ ok: false, error: b.error });
  } else if (body.mode !== "get") {
    return json({ ok: false, error: "unknown mode" }, 400);
  }
  const { data: row } = await admin.from("rep_personas")
    .select("persona, built_from, built_at").eq("salesperson_id", rep.id).maybeSingle();
  return json({ ok: true, persona: row?.persona ?? null, built_from: row?.built_from ?? null, built_at: row?.built_at ?? null });
});
