// Everything about the founder-notification pipe: configure it, look at it, and
// work its queue.
//
// One function rather than three because they share the same two ideas — which
// provider a company is on, and the shared secret that must never reach a
// browser. The admin page therefore never talks to the Baileys worker directly:
// it asks here, and the secret is fetched server-side and used server-side. A
// QR endpoint the browser could call with a bearer would be a bearer sitting in
// the browser.
//
// Actions (POST { action, ... }):
//   save      — where the worker lives + its secret, and switch the provider
//   provider  — switch provider without touching the worker settings
//   status    — what the worker says about itself
//   qr        — the current QR, while WhatsApp is offering one
//   reconnect — force a fresh connection attempt
//   route     — which pipe this company's notifications would leave by, probed
//   drain     — cron only: retry everything the outbox is holding
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { BaileysProvider, resolveRoute } from "../_shared/wa-provider.ts";
import { drainOutbox } from "../_shared/notify.ts";

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

/** Build a worker client for a company, using the secret only on this side. */
async function workerFor(
  admin: ReturnType<typeof createClient>, companyId: string,
): Promise<BaileysProvider | { error: string }> {
  const { data: b } = await admin.from("whatsapp_baileys")
    .select("base_url").eq("company_id", companyId).maybeSingle();
  if (!b?.base_url) return { error: "No Baileys worker is set up for this company yet." };
  const { data: secret } = await admin.rpc("get_baileys_secret", { p_company: companyId });
  if (!secret) return { error: "The worker's secret is missing. Re-enter it and save." };
  return new BaileysProvider(String(b.base_url), String(secret));
}

/** Cache what the worker said, so the WhatsApp list can show state without a round trip per row. */
async function cacheStatus(
  admin: ReturnType<typeof createClient>, companyId: string,
  s: { status: string; number: string | null; last_seen: string | null; error: string | null },
) {
  await admin.from("whatsapp_baileys").update({
    status: s.status,
    wa_number: s.number,
    last_seen_at: s.last_seen,
    last_error: s.error,
    updated_at: new Date().toISOString(),
  }).eq("company_id", companyId);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const admin = createClient(SUPABASE_URL, SERVICE);
  const body = await req.json().catch(() => ({}));
  const action = String(body?.action ?? "");

  const auth = req.headers.get("Authorization") ?? "";
  const bearer = auth.replace(/^Bearer\s+/i, "").trim();
  const isCron = !!bearer && bearer === SERVICE;

  // ---- Cron: work the queue for every company ----
  if (action === "drain") {
    if (!isCron) return json({ ok: false, error: "Not allowed" }, 403);
    const r = await drainOutbox(admin);
    return json({ ok: true, ...r });
  }

  // ---- Everything else is an admin acting on a company ----
  const u = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
  const { data: ud } = await u.auth.getUser();
  if (!ud?.user) return json({ ok: false, error: "Unauthorized" }, 401);

  const [{ data: me }, { data: pa }] = await Promise.all([
    admin.from("profiles").select("role, company_id").eq("id", ud.user.id).maybeSingle(),
    admin.from("platform_admins").select("user_id").eq("user_id", ud.user.id).maybeSingle(),
  ]);
  const isSuper = !!pa;
  if (me?.role !== "admin" && !isSuper) return json({ ok: false, error: "Admins only" }, 403);

  // A company admin acts on their own company and nothing else. The super admin
  // names the company, because the super admin is the platform's owner and every
  // page of theirs is cross-company by design.
  const companyId = isSuper && body?.company_id ? String(body.company_id) : String(me?.company_id ?? "");
  if (!companyId) return json({ ok: false, error: "No company." }, 400);
  if (!isSuper && body?.company_id && String(body.company_id) !== String(me?.company_id)) {
    return json({ ok: false, error: "Not your company." }, 403);
  }

  if (action === "save") {
    const baseUrl = String(body?.base_url ?? "").trim().replace(/\/+$/, "");
    const secret = String(body?.secret ?? "").trim();
    if (!/^https?:\/\//i.test(baseUrl)) {
      return json({ ok: false, error: "Give the worker's full address, starting with https://" }, 400);
    }
    await admin.from("whatsapp_baileys")
      .upsert({ company_id: companyId, base_url: baseUrl, updated_at: new Date().toISOString() }, { onConflict: "company_id" });
    // Through the USER's client on purpose: set_baileys_secret guards itself on
    // is_admin()/is_super_admin(), and those only mean anything under the
    // caller's own JWT. Called as the service role the guard would pass for
    // everyone, which is not a guard.
    if (secret) {
      const { error } = await u.rpc("set_baileys_secret", { p_company: companyId, p_secret: secret });
      if (error) return json({ ok: false, error: error.message }, 400);
    }
    return json({ ok: true });
  }

  if (action === "provider") {
    const provider = body?.provider === "baileys" ? "baileys" : "meta";
    const { data: existing } = await admin.from("whatsapp_integrations")
      .select("company_id").eq("company_id", companyId).maybeSingle();
    if (existing) {
      await admin.from("whatsapp_integrations").update({ provider }).eq("company_id", companyId);
    } else {
      // A company can be on Baileys with no Cloud API setup at all, so the row
      // has to be creatable from the provider choice alone.
      await admin.from("whatsapp_integrations").insert({
        company_id: companyId,
        provider,
        verify_token: crypto.randomUUID().replace(/-/g, ""),
        active: true,
      });
    }
    return json({ ok: true, provider });
  }

  // ── one telecaller's watch-only session ───────────────────────────────────
  //
  // Same worker, same secret, a different path — the worker holds many logins
  // now. Proxied through here for the same reason the founder's QR is: the
  // worker's bearer lives in the vault and must never reach a browser, where it
  // would sit in history and in every screenshot of the page.
  if (action === "rep_status" || action === "rep_qr" || action === "rep_reconnect" || action === "rep_reset") {
    const salespersonId = String(body?.salesperson_id ?? "");
    if (!salespersonId) return json({ ok: false, error: "salesperson_id required" }, 400);

    // The rep must belong to the company being administered. Without this a
    // company admin could read another tenant's session by guessing an id.
    const { data: who } = await admin.from("profiles")
      .select("company_id").eq("id", salespersonId).maybeSingle();
    if (!who || who.company_id !== companyId) {
      return json({ ok: false, error: "That telecaller is not in this company." }, 403);
    }

    const w = await workerFor(admin, companyId);
    if ("error" in w) return json({ ok: false, error: w.error }, 400);

    if (action === "rep_reconnect") {
      await w.repConnect(salespersonId);
      return json({ ok: true, status: "connecting" });
    }
    // Wipes the saved login so the next connection is a genuine first link —
    // the only path to a fresh QR and to WhatsApp's history sync. The stored
    // messages are NOT touched: this forgets a credential, not a rep's work.
    if (action === "rep_reset") {
      const rr = await w.repReset(salespersonId);
      if (!rr.ok) return json({ ok: false, error: rr.error }, 502);
      await admin.from("wa_rep_sessions").update({
        status: "disconnected",
        wa_number: null,
        last_error: null,
        // Cleared, not left stale: until the rep scans again nothing is being
        // watched, and a leftover timestamp would keep the card saying
        // "Connected · last heard 40m ago" about a session that no longer has
        // credentials at all. That exact stale reading is what sent us hunting
        // for a bug in the ingest.
        last_seen_at: null,
      }).eq("salesperson_id", salespersonId);
      return json({ ok: true, status: "connecting" });
    }
    if (action === "rep_qr") {
      return json({ ok: true, ...(await w.repQr(salespersonId)) });
    }
    const rs = await w.repStatus(salespersonId);
    // A BACKLOG IS A FAILURE, AND IT IS THE SILENT ONE.
    //
    // The worker holds what it could not deliver and retries. So the state that
    // looks most like health — WhatsApp connected, no error from the worker — is
    // exactly what a missing BAILEYS_INGEST_SECRET produces: whatsapp-observe
    // answers 503 on every batch, the queue grows, and the dashboard shows a
    // scanned rep with zero messages. Zero, again, meaning unknown.
    //
    // SAY WHAT IS OBSERVED, NOT WHAT IS SUSPECTED.
    //
    // This used to declare "the CRM is not accepting this worker's reports.
    // Check BAILEYS_INGEST_SECRET" the moment the queue was non-empty. That was
    // a guess presented as a diagnosis, and it was wrong: the ingest was
    // answering 200 the whole time and the queue was simply mid-flush. It cost
    // a round of debugging aimed at a secret that was never the problem.
    //
    // A queue is also normal for a few seconds after a history sync. Only a
    // queue that is genuinely large is worth mentioning at all, and even then
    // only as an observation the reader can act on.
    const stuck = rs.queued > 50
      ? `${rs.queued} messages queued on the worker and not yet accepted by the CRM. ` +
        "If this number keeps climbing, check that BAILEYS_INGEST_SECRET is the same " +
        "on the worker and in Supabase."
      : null;
    // Mirror what the worker says into wa_rep_sessions, so the dashboard table
    // and the Daily Pulse agree without either of them polling the worker.
    //
    // TWO WRITERS, ONE FIELD — so neither may stamp on the other.
    //
    // The ingest explains why nothing is stored ("seen 7, none were leads").
    // This poll explains whether the worker is reachable. If a healthy poll
    // blanket-wrote last_error it would erase the ingest's explanation seconds
    // after it appeared, and the admin would be back to an empty card with no
    // reason given. So a poll with nothing to report leaves the field alone and
    // lets the ingest own it.
    const patch: Record<string, unknown> = { status: rs.status, wa_number: rs.number };
    const problem = rs.error ?? stuck;
    if (problem) patch.last_error = problem;
    // last_seen_at is the INGEST's to set. A status poll proves the worker is
    // up; it does not prove messages are flowing, and conflating the two is
    // how "Connected" would start lying.
    await admin.from("wa_rep_sessions").update(patch).eq("salesperson_id", salespersonId);
    return json({ ok: true, ...rs, stuck });
  }

  if (action === "status" || action === "qr" || action === "reconnect") {
    const w = await workerFor(admin, companyId);
    if ("error" in w) return json({ ok: false, error: w.error }, 400);

    if (action === "reconnect") {
      await w.connect();
      return json({ ok: true, status: "connecting" });
    }
    if (action === "qr") {
      const q = await w.qr().catch(() => ({ status: "disconnected", qr: null }));
      return json({ ok: true, ...q });
    }
    const s = await w.status().catch(() => ({
      status: "disconnected", number: null, last_seen: null,
      error: "Could not reach the worker. Check the URL and that the service is running.",
    }));
    await cacheStatus(admin, companyId, s);
    return json({ ok: true, ...s });
  }

  // ---- Which pipe would actually carry this company's notifications ----
  //
  // Answered by asking resolveRoute — the same ladder the sending code climbs —
  // rather than by re-reading whatsapp_integrations here. A second copy of
  // "own Baileys, then own Meta, then the platform's" is a copy that will
  // disagree with the first one eventually, and the day it does, the Automation
  // Center will confidently name the wrong number.
  //
  // Then it PROBES. Configured and connected are different states, and the
  // difference is the single most common reason a founder's report does not
  // arrive: the Baileys session is logged out and everything else looks fine.
  if (action === "route") {
    const r = await resolveRoute(admin, companyId);
    if ("error" in r) return json({ ok: true, route: null, reason: r.error });

    const p = r.provider;
    let lenderName: string | null = null;
    if (r.lenderCompanyId) {
      const { data: c } = await admin.from("companies").select("name").eq("id", r.lenderCompanyId).maybeSingle();
      lenderName = (c?.name as string | null) ?? null;
    }

    if (p.name === "baileys") {
      const s = await (p as BaileysProvider).status().catch(() => ({
        status: "disconnected", number: null, last_seen: null,
        error: "Could not reach the worker. Check the URL and that the service is running.",
      }));
      if (r.lenderCompanyId) await cacheStatus(admin, r.lenderCompanyId, s);
      else await cacheStatus(admin, companyId, s);
      return json({
        ok: true,
        route: {
          provider: "baileys", via: r.via, lender: lenderName,
          connected: s.status === "connected",
          number: s.number, last_seen: s.last_seen, error: s.error,
        },
      });
    }

    // Meta has no session to be up or down — having credentials is the only
    // "connected" it has, and whether the token is still alive is discovered
    // one message at a time. Saying so beats a green light that means nothing.
    const ok = await p.isConnected();
    return json({
      ok: true,
      route: {
        provider: "meta", via: r.via, lender: lenderName,
        connected: ok, number: null, last_seen: null,
        error: ok ? null : "Credentials are missing or incomplete.",
        note: "Meta is stateless: credentials exist, but whether the token is still valid is only " +
          "known when a message is sent.",
      },
    });
  }

  return json({ ok: false, error: `Unknown action: ${action}` }, 400);
});
