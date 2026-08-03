// The floating AI Coach in the app — one endpoint, one panel.
//
// POST {} (rep JWT) → {
//   coaching: { good, improve, callAt, leadName } | null   — the rep's LAST
//     real call (>= 30s, transcript ready). Generated ONCE per call and cached
//     in coach_feedback: short calls are fake/no-signal (plot bechne wali call
//     lambi hoti hai) and re-coaching every open would frustrate the rep.
//   brief: { slot, content } | null — after 10 AM IST: "kal ka din kaisa tha";
//     after 6 PM IST: "aaj kya acha raha". Cached per rep/date/slot.
// }
//
// Linked, not duplicated: it reads the SAME call_logs transcripts and
// lead_voice_notes that team-pulse / sales-xray read, and WRITES its coaching
// into shared tables those features (and manager-digest) can join on. The
// accumulated coach_feedback rows are the growing corpus that trains Call Pro
// AI's coaching for every company automatically.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GROQ = Deno.env.get("GROQ_API_KEY") ?? "";

const MIN_COACH_SECONDS = 30;

// Supabase Edge's built-in embedding model (gte-small) — same one assistant-chat
// and rag-ask use, so the coach quotes the SAME company brain, not a copy.
// deno-lint-ignore no-explicit-any
const embedModel = new (Supabase as any).ai.Session("gte-small");

/** Top company-playbook facts relevant to this call (RAG link — company brain +
 *  shared global brain via match_knowledge). Empty on any failure: coaching
 *  still works without facts, it just can't quote exact prices/offers. */
async function playbookFacts(admin: SupabaseClient, companyId: string, text: string): Promise<string[]> {
  try {
    const embedding = await embedModel.run(text.slice(0, 1200), { mean_pool: true, normalize: true });
    const { data } = await admin.rpc("match_knowledge", {
      p_company: companyId, p_embedding: embedding, p_match_count: 3, p_min_similarity: 0.25,
    });
    return ((data ?? []) as Array<{ content: string }>).map((k) => String(k.content).slice(0, 400));
  } catch {
    return [];
  }
}

// Two-way "ask the coach": the rep asks anything, live. Grounded in the SAME
// brain (company playbook + global guidebook + harvested wins) and always aimed
// at the next funnel step.
const ASK_SYSTEM =
  "You are a sharp, friendly senior real-estate sales coach helping a telecaller LIVE, right now. " +
  "The question may be in Hindi, English or Hinglish, in any script — understand all three, and ALWAYS " +
  "answer in easy Roman Hinglish (aap-form), short and practical. " +
  'Reply ONLY as JSON {"answer": string}. Give a concrete, doable answer — a line they can actually say, ' +
  "or the next step to take — not theory or a lecture. If brain facts are provided, ground the answer in " +
  "them (quote the exact price / offer / rebuttal line) instead of generic advice. Your north star: move the " +
  "lead one step forward — interested → site visit → booking. Finish with the single next action or a " +
  "ready-to-speak line. NEVER invent facts that aren't in the brain; if unknown, say what to find out.";

const COACH_SYSTEM =
  "You are a warm, senior real-estate sales coach reviewing ONE call by a telecaller. " +
  "The transcript may be in Hindi, English or Hinglish, in any script — understand all three. " +
  'Reply ONLY as JSON {"rating": number, "good": string, "improve": string}. ' +
  "rating = an HONEST 1-5 score of this call (1 = weak, 5 = excellent). Be fair, not inflated. " +
  "good = what the rep genuinely did well on THIS call, in warm easy Hinglish (Roman script, aap-form), 1-2 short sentences — always motivating. " +
  "improve = the ONE most useful thing to do better next time, same Hinglish style. " +
  "IMPORTANT: if the call was genuinely good (rating >= 4) and there is no real, useful improvement, set improve to \"\" (empty) — do NOT invent a suggestion just to fill it; a rep who did well should only be motivated, not confused. Only give improve when it truly helps. Never a list. " +
  "If company playbook facts are provided, ground the improve tip in them (exact price / offer / rebuttal ka reference do). Be specific to the transcript. NEVER invent details.";

/** Generate + store coaching for one call. Returns true when a row was written. */
async function coachOneCall(
  admin: SupabaseClient,
  call: { id: string; salesperson_id: string; company_id: string; transcript: string; summary?: string | null },
): Promise<boolean> {
  const facts = await playbookFacts(admin, call.company_id, call.summary || call.transcript);
  const factsBlock = facts.length
    ? `\n\nCompany playbook facts (use if relevant):\n${facts.map((f) => `- ${f}`).join("\n")}`
    : "";
  const out = await groqJson(
    COACH_SYSTEM,
    `Call transcript:\n\n${String(call.transcript).slice(0, 9000)}${factsBlock}`,
  );
  const good = typeof out?.good === "string" ? out.good : null;
  // Empty improve = "call was good, nothing to add" — keep it null, don't force one.
  const improveRaw = typeof out?.improve === "string" ? out.improve.trim() : "";
  const improve = improveRaw.length ? improveRaw : null;
  const ratingNum = Number(out?.rating);
  const rating = Number.isFinite(ratingNum) ? Math.max(1, Math.min(5, Math.round(ratingNum))) : null;
  if (!good && !improve && rating == null) return false;
  await admin.from("coach_feedback").upsert({
    call_id: call.id, salesperson_id: call.salesperson_id, company_id: call.company_id,
    good, improve, rating,
  });
  return true;
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

function istNow(): Date {
  return new Date(Date.now() + 5.5 * 3600 * 1000);
}
function istDate(offsetDays = 0): string {
  return new Date(Date.now() + 5.5 * 3600 * 1000 + offsetDays * 86400_000).toISOString().slice(0, 10);
}
function istDayStartIso(offsetDays = 0): string {
  return new Date(`${istDate(offsetDays)}T00:00:00+05:30`).toISOString();
}

async function groqJson(system: string, user: string, temperature = 0.4): Promise<Record<string, unknown> | null> {
  if (!GROQ) return null;
  try {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${GROQ}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile", temperature, response_format: { type: "json_object" },
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
      }),
    });
    const raw = (await r.json()).choices?.[0]?.message?.content ?? "";
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const auth = req.headers.get("Authorization") ?? "";
  const bearer = auth.replace(/^Bearer\s+/i, "").trim();

  // ---- Backfill mode (service key only): coach the EXISTING transcripts so the
  // corpus starts full, instead of only growing from today. Batched — call it
  // repeatedly until remaining = 0. Same >=30s rule as live coaching.
  if (bearer === SERVICE) {
    const body = await req.json().catch(() => ({}));
    if (body.mode !== "backfill") return json({ ok: false, error: "unknown service mode" }, 400);
    const limit = Math.min(Math.max(Number(body.limit) || 15, 1), 30);
    const admin = createClient(SUPABASE_URL, SERVICE);

    const { data: rows } = await admin.from("call_logs")
      .select("id, salesperson_id, company_id, transcript, summary, coach_feedback!left(call_id)")
      .not("transcript", "is", null)
      .gte("duration_seconds", MIN_COACH_SECONDS)
      .not("salesperson_id", "is", null)
      .is("coach_feedback", null)
      .order("started_at", { ascending: false, nullsFirst: false })
      .limit(limit);

    let done = 0, failed = 0;
    for (const r of rows ?? []) {
      if (String(r.transcript ?? "").length < 40) { failed++; continue; }
      const ok = await coachOneCall(admin, r as never).catch(() => false);
      if (ok) done++; else failed++;
    }
    const { count } = await admin.from("call_logs")
      .select("id, coach_feedback!left(call_id)", { count: "exact", head: true })
      .not("transcript", "is", null)
      .gte("duration_seconds", MIN_COACH_SECONDS)
      .not("salesperson_id", "is", null)
      .is("coach_feedback", null);
    return json({ ok: true, coached: done, failed, remaining: count ?? 0 });
  }

  const u = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
  const { data: ud } = await u.auth.getUser();
  if (!ud?.user) return json({ ok: false, error: "Unauthorized" }, 401);
  const uid = ud.user.id;

  const admin = createClient(SUPABASE_URL, SERVICE);
  const { data: prof } = await admin.from("profiles").select("company_id, full_name").eq("id", uid).maybeSingle();
  if (!prof?.company_id) return json({ ok: false, error: "No company" }, 400);
  const company = prof.company_id as string;

  const body = await req.json().catch(() => ({} as Record<string, unknown>));

  // ---------- ASK mode: two-way Q&A, grounded + goal-oriented ----------
  if (body.mode === "ask") {
    const question = String(body.question ?? "").trim();
    if (!question) return json({ ok: false, error: "empty question" }, 400);
    const facts = await playbookFacts(admin, company, question);
    const factsBlock = facts.length
      ? `\n\nBrain facts (company playbook + guidebook + past wins) — ground your answer in these:\n${facts.map((f) => `- ${f}`).join("\n")}`
      : "";
    const out = await groqJson(
      ASK_SYSTEM,
      `Telecaller's question:\n${question.slice(0, 800)}${factsBlock}`,
      0.5,
    );
    const answer = typeof out?.answer === "string" ? out.answer.trim() : null;
    const contactId = typeof body.contact_id === "string" ? body.contact_id : null;
    // Save to the rep's memory — their questions become team signal, and the
    // best Q&A can later be promoted into the shared brain.
    await admin.from("coach_qa").insert({
      company_id: company, salesperson_id: uid,
      question: question.slice(0, 2000), answer, contact_id: contactId,
    }).catch(() => {});
    return json({ ok: true, answer: answer ?? "Abhi jawab nahi bana paaya — ek baar phir poochhiye." });
  }

  // ---------- LEAD mode: rating + guidance for ONE lead's last real call ----
  // Shown on the lead's own page — the coach "observes" that lead's recording
  // (transcript) and gives an honest rating + one guidance line, per lead.
  if (body.mode === "lead") {
    const contactId = String(body.contact_id ?? "").trim();
    if (!contactId) return json({ ok: false, error: "contact_id required" }, 400);
    const { data: call } = await admin.from("call_logs")
      .select("id, started_at, duration_seconds, transcript, summary")
      .eq("contact_id", contactId)
      .gte("duration_seconds", MIN_COACH_SECONDS)
      .not("transcript", "is", null)
      .order("started_at", { ascending: false, nullsFirst: false })
      .limit(1).maybeSingle();
    if (!call?.id) return json({ ok: true, coaching: null });

    const { data: cached } = await admin.from("coach_feedback")
      .select("good, improve, rating").eq("call_id", call.id).maybeSingle();
    let good = cached?.good as string | undefined;
    let improve = cached?.improve as string | undefined;
    let rating = cached?.rating as number | undefined;
    // Regenerate when never coached OR coached before rating existed (rating null).
    if (!cached || cached.rating == null) {
      const wrote = await coachOneCall(admin, {
        id: call.id as string, salesperson_id: uid, company_id: company,
        transcript: String(call.transcript), summary: call.summary as string | null,
      }).catch(() => false);
      if (wrote) {
        const { data: fresh } = await admin.from("coach_feedback")
          .select("good, improve, rating").eq("call_id", call.id).maybeSingle();
        good = (fresh?.good as string) ?? good;
        improve = (fresh?.improve as string) ?? improve;
        rating = (fresh?.rating as number) ?? rating;
      }
    }
    return json({
      ok: true,
      coaching: { good: good ?? null, improve: improve ?? null, rating: rating ?? null, callAt: call.started_at },
    });
  }

  // ---------- DAY REVIEW mode: the 7pm card the rep actually gets ----------
  //
  // The assistant already asks one honest question at 7pm and shows four
  // counters next to it. This is the same moment doing more work: the numbers a
  // rep is judged on, what genuinely went well, the ONE habit that cost them
  // deals today with the exact line to say instead, and tomorrow's first two
  // calls.
  //
  // The split of labour matters. Every number here is COUNTED — a rep will
  // argue with a score, and they have to be able to win that argument by
  // pointing at their own call list. The model is only asked for the two things
  // arithmetic cannot produce: what to praise, and the pattern across the day's
  // calls that the rep cannot see from inside them.
  //
  // Cached per rep per date, so closing the card and reopening the app does not
  // regenerate it, does not cost a second Groq call, and never shows a rep two
  // different reviews of the same day.
  if (body.mode === "day_review") {
    const reviewDate = istDate();
    const from = istDayStartIso(0);
    const to = new Date().toISOString();

    const { data: cachedReview } = await admin.from("coach_briefs")
      .select("content").eq("salesperson_id", uid)
      .eq("brief_date", reviewDate).eq("slot", "review").maybeSingle();
    if (cachedReview?.content) {
      try { return json({ ok: true, review: JSON.parse(String(cachedReview.content)) }); } catch { /* regenerate */ }
    }

    const [{ data: calls }, { data: acts }, { data: notes }, { data: due }, { data: awaitingFeedback }] =
      await Promise.all([
        admin.from("call_logs").select("duration_seconds, outcome, summary")
          .eq("salesperson_id", uid).gte("started_at", from).lt("started_at", to).limit(200),
        admin.from("lead_activities").select("type, detail, contact_id")
          .eq("actor_id", uid).gte("created_at", from).lt("created_at", to).limit(200),
        admin.from("lead_voice_notes").select("summary").eq("salesperson_id", uid)
          .gte("created_at", from).lt("created_at", to).limit(40),
        // Tomorrow's first calls. Anything already overdue counts too — that is
        // the call they most need to make first thing.
        admin.from("follow_ups").select("name, phone, due_at, note")
          .eq("salesperson_id", uid).eq("status", "pending")
          .lte("due_at", `${istDate(1)}T23:59:59+05:30`)
          .order("due_at", { ascending: true }).limit(8),
        // The customer walked the site and nobody has asked them what they
        // thought. Nothing in the pipeline goes cold faster.
        admin.from("contacts").select("name, phone")
          .eq("salesperson_id", uid).eq("status", "site_visit")
          .not("site_visit_arrived_at", "is", null)
          .or("site_visit_verified.is.null,site_visit_verified.eq.false").limit(3),
      ]);

    const callRows = calls ?? [];
    const total = callRows.length;
    const connected = callRows.filter((c) => (c.duration_seconds ?? 0) >= MIN_COACH_SECONDS).length;
    // "Meaningful" is not "connected". Ninety seconds is roughly where a real
    // estate call stops being "haan bhaijaan baad me baat karte hain" and
    // becomes a conversation someone could book a visit out of.
    const conversations = callRows.filter((c) => (c.duration_seconds ?? 0) >= 90).length;
    const talkMin = Math.round(callRows.reduce((s, c) => s + (c.duration_seconds ?? 0), 0) / 60);

    const actRows = acts ?? [];
    const distinct = (rows: typeof actRows) => new Set(rows.map((a) => String(a.contact_id ?? ""))).size;
    const visitsFixed = distinct(actRows.filter((a) => a.type === "site_visit"));
    const bookings = distinct(actRows.filter((a) => /\bbook(ed|ing)\b/i.test(String(a.detail ?? ""))));

    // A score a rep can check against their own call list, out of 10. Weighted
    // the way the business actually works: getting through matters, real
    // conversations matter more, and a fixed visit or a booking is the day.
    // Deliberately not a curve against other reps — comparing a rep to the team
    // is a different (worse) feeling, and this card is theirs alone.
    const rate = total ? connected / total : 0;
    const score = total === 0 ? null : Math.round(Math.min(10,
      rate * 3 +
      Math.min(conversations / 8, 1) * 2 +
      Math.min(visitsFixed * 1.5, 3) +
      Math.min(bookings * 2, 2),
    ) * 10) / 10;

    const priorities: { lead: string; why: string }[] = [];
    for (const c of awaitingFeedback ?? []) {
      if (priorities.length >= 2) break;
      priorities.push({
        lead: String(c.name ?? c.phone ?? "lead"),
        why: "Site visit ho chuki hai — feedback lena sabse zaroori hai.",
      });
    }
    for (const f of due ?? []) {
      if (priorities.length >= 3) break;
      const lead = String(f.name ?? f.phone ?? "lead");
      if (priorities.some((p) => p.lead === lead)) continue;
      const at = new Date(String(f.due_at)).toLocaleTimeString("en-IN", {
        timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true,
      });
      priorities.push({ lead, why: `Callback ${at} — aapne time diya tha.` });
    }

    // Best and worst call of the day — a sort, not a second AI pass.
    //
    // Every call over 30s with a transcript already gets an honest 1-5 rating
    // and a good/improve line written into coach_feedback the first time the
    // coach panel opens. Asking a model to pick the best call again would cost
    // a generation to re-derive a number we already stored, and would be free
    // to disagree with the rating the rep saw on that same call this morning.
    //
    // Both only appear when there is something to compare: with one rated call
    // the "worst call of the day" is also the best one, and telling a rep their
    // only real conversation was the worst thing they did all day is the exact
    // opposite of coaching.
    let bestCall: Record<string, unknown> | null = null;
    let worstCall: Record<string, unknown> | null = null;
    {
      const { data: rated } = await admin.from("coach_feedback")
        .select("rating, good, improve, call_id, call_logs!inner(contact_id, started_at)")
        .eq("salesperson_id", uid)
        .not("rating", "is", null)
        .gte("call_logs.started_at", from).lt("call_logs.started_at", to)
        .limit(60);
      const rows = (rated ?? []) as Array<Record<string, unknown>>;
      if (rows.length >= 2) {
        const score = (r: Record<string, unknown>) => Number(r.rating ?? 0);
        const sorted = [...rows].sort((a, b) => score(b) - score(a));
        const top = sorted[0], bottom = sorted[sorted.length - 1];
        // A flat day — every call rated the same — has no best and no worst.
        if (score(top) > score(bottom)) {
          const nameOf = async (r: Record<string, unknown>) => {
            const cl = r.call_logs as { contact_id?: string } | undefined;
            if (!cl?.contact_id) return null;
            const { data: c } = await admin.from("contacts").select("name, phone")
              .eq("id", cl.contact_id).maybeSingle();
            return (c?.name as string) || (c?.phone as string) || null;
          };
          bestCall = { lead: await nameOf(top), rating: score(top), why: top.good ?? null };
          worstCall = { lead: await nameOf(bottom), rating: score(bottom), why: bottom.improve ?? null };
        }
      }
    }

    const counts = { calls: total, connected, conversations, visitsFixed, bookings, talkMin };
    let wins: string[] = [];
    let improve: { pattern: string; say: string } | null = null;

    if (total > 0) {
      const out = await groqJson(
        "You coach ONE real-estate telecaller at the end of their day. Input summaries may be in " +
        "Hindi, English or Hinglish, any script — understand all three. Reply ONLY as JSON " +
        '{"wins": string[], "improve": {"pattern": string, "say": string}}.\n' +
        "wins = 1-3 short lines on what they genuinely did well today, easy Roman Hinglish (aap-form). " +
        "Base each one on the actual summaries, never on the counts — the numbers are already printed " +
        "on the card above your text.\n" +
        "improve.pattern = the ONE habit across today's calls that cost them deals, named plainly " +
        "(\"9 customers ne kaha baad mein baat karte hain — aap next date confirm kiye bina call end " +
        "kar dete hain\"). Look for what REPEATS; one bad call is not a pattern.\n" +
        "improve.say = the exact sentence to say instead, ready to speak, in Hinglish. Not advice — " +
        "the words.\n" +
        "If today shows no real repeated weakness, set improve to null. A rep who did well should be " +
        "motivated, not handed an invented fault. Never scold. NEVER invent details.",
        `Rep: ${prof.full_name ?? "telecaller"}\n` +
        `Calls: ${total}, real conversations: ${conversations}, site visits fixed: ${visitsFixed}, bookings: ${bookings}.\n` +
        `Call summaries:\n${callRows.map((c) => c.summary).filter(Boolean).slice(0, 20).map((s) => `- ${s}`).join("\n") || "(none)"}\n` +
        `Voice notes:\n${(notes ?? []).map((n) => n.summary).filter(Boolean).slice(0, 12).map((s) => `- ${s}`).join("\n") || "(none)"}`,
        0.5,
      );
      wins = Array.isArray(out?.wins)
        ? (out.wins as unknown[]).map((w) => String(w).trim()).filter(Boolean).slice(0, 3)
        : [];
      const imp = out?.improve as { pattern?: unknown; say?: unknown } | null | undefined;
      const pattern = String(imp?.pattern ?? "").trim();
      const say = String(imp?.say ?? "").trim();
      if (pattern) improve = { pattern, say };
    }

    const review = { date: reviewDate, score, ...counts, wins, improve, priorities, bestCall, worstCall };
    // Only cache once the model has answered. Caching a half-empty review
    // because Groq was rate-limited at 7:01pm would freeze that rep's whole
    // evening into a card with no coaching on it.
    if (wins.length || improve || bestCall) {
      await admin.from("coach_briefs").upsert({
        salesperson_id: uid, brief_date: reviewDate, slot: "review",
        company_id: company, content: JSON.stringify(review),
      }).catch(() => {});
    }
    return json({ ok: true, review });
  }

  // ONE fresh Groq generation per request max — coaching, brief and tip each
  // make an LLM call, and doing all three at once blew the edge time budget
  // (HTTP 546). Cached results are always free; anything uncached gets filled in
  // on the next open. Priority: coaching > brief > tip.
  let spent = false;

  // ---------- 1) Last-call coaching (cached per call) ----------
  let coaching: Record<string, unknown> | null = null;
  const { data: lastCall } = await admin.from("call_logs")
    .select("id, contact_id, started_at, duration_seconds, transcript, summary")
    .eq("salesperson_id", uid)
    .gte("duration_seconds", MIN_COACH_SECONDS)
    .not("transcript", "is", null)
    .order("started_at", { ascending: false, nullsFirst: false })
    .limit(1).maybeSingle();

  if (lastCall?.id) {
    const { data: cached } = await admin.from("coach_feedback")
      .select("good, improve, rating").eq("call_id", lastCall.id).maybeSingle();
    let good = cached?.good as string | undefined;
    let improve = cached?.improve as string | undefined;
    let rating = cached?.rating as number | undefined;

    // Regenerate when never coached OR coached before rating existed (rating null),
    // so the star rating actually appears instead of staying blank.
    if ((!cached || cached.rating == null) && !spent) {
      spent = true;
      // RAG-grounded: the coach quotes the company's own playbook (prices,
      // offers, rebuttals) — same brain assistant-chat / rag-ask use.
      const wrote = await coachOneCall(admin, {
        id: lastCall.id as string, salesperson_id: uid, company_id: company,
        transcript: String(lastCall.transcript), summary: lastCall.summary as string | null,
      }).catch(() => false);
      if (wrote) {
        const { data: fresh } = await admin.from("coach_feedback")
          .select("good, improve, rating").eq("call_id", lastCall.id).maybeSingle();
        good = (fresh?.good as string) ?? undefined;
        improve = (fresh?.improve as string) ?? undefined;
        rating = (fresh?.rating as number) ?? undefined;
      }
    }

    if (good || improve || rating != null) {
      let leadName: string | null = null;
      if (lastCall.contact_id) {
        const { data: c } = await admin.from("contacts").select("name").eq("id", lastCall.contact_id).maybeSingle();
        leadName = (c?.name as string) ?? null;
      }
      coaching = { good: good ?? null, improve: improve ?? null, rating: rating ?? null, callAt: lastCall.started_at, leadName };
    }
  }

  // ---------- 2) Time-aware brief (10 AM → yesterday, 6 PM → today) ----------
  let brief: Record<string, unknown> | null = null;
  const hour = istNow().getUTCHours(); // istNow is shifted, so getUTCHours IS the IST hour
  const slot = hour >= 18 ? "evening" : hour >= 10 ? "morning" : null;

  if (slot) {
    const briefDate = istDate();
    const { data: cachedBrief } = await admin.from("coach_briefs")
      .select("content").eq("salesperson_id", uid).eq("brief_date", briefDate).eq("slot", slot).maybeSingle();

    if (cachedBrief?.content) {
      brief = { slot, content: cachedBrief.content };
    } else {
      // Morning reviews YESTERDAY; evening reviews TODAY. Same raw data the
      // pulse/x-ray pipelines read — no separate bookkeeping.
      const from = slot === "morning" ? istDayStartIso(-1) : istDayStartIso(0);
      const to = slot === "morning" ? istDayStartIso(0) : new Date().toISOString();

      const [{ data: calls }, { data: notes }] = await Promise.all([
        admin.from("call_logs")
          .select("duration_seconds, outcome, summary")
          .eq("salesperson_id", uid).gte("started_at", from).lt("started_at", to)
          .order("started_at").limit(120),
        admin.from("lead_voice_notes")
          .select("summary").eq("salesperson_id", uid)
          .gte("created_at", from).lt("created_at", to).limit(40),
      ]);

      const total = calls?.length ?? 0;
      const connected = (calls ?? []).filter((c) => (c.duration_seconds ?? 0) >= MIN_COACH_SECONDS).length;
      const talkMin = Math.round((calls ?? []).reduce((s, c) => s + (c.duration_seconds ?? 0), 0) / 60);
      const callSummaries = (calls ?? []).map((c) => c.summary).filter(Boolean).slice(0, 12);
      const noteSummaries = (notes ?? []).map((n) => n.summary).filter(Boolean).slice(0, 12);

      if (total === 0 && noteSummaries.length === 0) {
        brief = {
          slot,
          content: slot === "morning"
            ? "Kal koi call log nahi hui. Aaj fresh shuruaat karte hain — pehle 2 ghante me 10 calls ka target rakhiye! 💪"
            : "Aaj abhi tak koi call log nahi hui. Din khatam hone se pehle kuch follow-ups nipta lijiye! 📞",
        };
      } else if (!spent) {
        spent = true;
        const label = slot === "morning" ? "KAL (yesterday)" : "AAJ (today, so far)";
        const out = await groqJson(
          "You are a supportive real-estate sales coach writing a mini day-review for a telecaller. " +
          "The input summaries may be in Hindi, English or Hinglish — understand all three. " +
          'Reply ONLY as JSON {"content": string}. content = 3-4 short lines in easy Hinglish (Roman script, aap-form): ' +
          "(1) ek line me din ka scorecard, (2) sabse important baat / best moment from the summaries, " +
          "(3) ek concrete focus for next. Max ~70 words, emojis welcome, never scolding, never generic. NEVER invent details.",
          `${label} for ${prof.full_name ?? "the rep"}:\n` +
          `Calls: ${total}, real conversations (>=30s): ${connected}, talk time: ${talkMin} min.\n` +
          `Call summaries:\n${callSummaries.map((s) => `- ${s}`).join("\n") || "(none)"}\n` +
          `Voice-note summaries:\n${noteSummaries.map((s) => `- ${s}`).join("\n") || "(none)"}`,
          0.5,
        );
        const content = typeof out?.content === "string" && out.content.trim() ? out.content.trim() : null;
        if (content) {
          await admin.from("coach_briefs").upsert({
            salesperson_id: uid, brief_date: briefDate, slot, company_id: company, content,
          });
          brief = { slot, content };
        }
      }
    }
  }

  // ---------- 3) Daily tip (one per rep per day, from the brain) ----------
  let tip: string | null = null;
  {
    const tipDate = istDate();
    const { data: cachedTip } = await admin.from("coach_briefs")
      .select("content").eq("salesperson_id", uid).eq("brief_date", tipDate).eq("slot", "tip").maybeSingle();
    if (cachedTip?.content) {
      tip = cachedTip.content as string;
    } else if (!spent) {
      spent = true;
      // Seed the tip with real brain facts (guidebook + harvested wins +
      // playbook) so it's specific, not filler — aimed at the funnel goal.
      const seed = await playbookFacts(
        admin, company,
        "site visit close booking objection follow-up price offer real estate sales tip",
      );
      const out = await groqJson(
        "You are a senior real-estate sales coach. Give ONE short daily tip to a telecaller in easy Roman " +
        "Hinglish (aap-form), max 30 words, concrete and doable, aimed at moving leads interested → site " +
        'visit → booking. Reply ONLY as JSON {"tip": string}. If brain facts are given, base the tip on them ' +
        "(quote a real offer/line). Never generic filler, never invent facts.",
        seed.length
          ? `Brain facts:\n${seed.map((f) => `- ${f}`).join("\n")}`
          : "No specific facts — give one solid universal site-visit/closing tip.",
        0.7,
      );
      const t = typeof out?.tip === "string" && out.tip.trim() ? out.tip.trim() : null;
      if (t) {
        await admin.from("coach_briefs").upsert({
          salesperson_id: uid, brief_date: tipDate, slot: "tip", company_id: company, content: t,
        });
        tip = t;
      }
    }
  }

  return json({ ok: true, coaching, brief, tip });
});
