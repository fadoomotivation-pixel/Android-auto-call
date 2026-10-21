// Follow-up reminders for the /app web app — the browser's version of the
// Android alarm in notify/FollowUpReminder.kt.
//
// POST { action: "key" }       → { publicKey }   the VAPID key a browser
//                                 subscribes with. Public by definition; no auth.
// POST { action: "send-due" }  → service role only (cron web-push-due-1min,
//                                 migration 0229). Claims what is due — at most
//                                 once per (follow-up, due time) — and pushes it.
//
// The VAPID private key is created here on first use and kept in Vault
// (web_push_vapid_store). It is never in a file, a commit or an env var.
//
// One push per rep per minute: if three callbacks fall due together the rep gets
// "3 callbacks due now", not three buzzes.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { generateVapidKeys, publicKeyFromJwk, sendWebPush, type VapidKeys } from "../_shared/webpush.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUBJECT = "https://callproai.in";

function json(o: unknown, s = 200) {
  return new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
}

let vapidCache: VapidKeys | null = null;
async function vapid(admin: SupabaseClient): Promise<VapidKeys> {
  if (vapidCache) return vapidCache;
  const { data, error } = await admin.rpc("web_push_vapid");
  if (error) throw new Error(`web_push_vapid: ${error.message}`);
  let jwk = data as string | null;
  if (!jwk) {
    const fresh = await generateVapidKeys();
    const { data: stored, error: e2 } = await admin.rpc("web_push_vapid_store", { p_jwk: JSON.stringify(fresh.privateJwk) });
    if (e2) throw new Error(`web_push_vapid_store: ${e2.message}`);
    jwk = stored as string;
  }
  const privateJwk = JSON.parse(jwk) as JsonWebKey;
  vapidCache = { publicKey: publicKeyFromJwk(privateJwk), privateJwk };
  return vapidCache;
}

type Due = { fu_id: string; rep_id: string; lead_id: string | null; lead_name: string | null; lead_phone: string; fu_note: string | null; fu_due: string };

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });

/** What the lock screen says. Short, plain, one action. */
function message(items: Due[]) {
  if (items.length === 1) {
    const d = items[0];
    const who = d.lead_name || d.lead_phone;
    return {
      title: `Call ${who} now`,
      body: `Callback you booked for ${time(d.fu_due)}${d.fu_note ? ` · ${d.fu_note}` : ""}`,
      url: d.lead_id ? `/app?lead=${d.lead_id}` : "/app?tab=follow",
      tag: `fu-${d.fu_id}`,
    };
  }
  const names = items.slice(0, 3).map((d) => d.lead_name || d.lead_phone).join(", ");
  return {
    title: `${items.length} callbacks due now`,
    body: items.length > 3 ? `${names} and ${items.length - 3} more` : names,
    url: "/app?tab=follow",
    tag: "fu-due",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const admin = createClient(SUPABASE_URL, SERVICE);
  const body = await req.json().catch(() => ({}));
  const action = body?.action ?? "key";

  try {
    if (action === "key") return json({ publicKey: (await vapid(admin)).publicKey });

    if (action !== "send-due") return json({ ok: false, error: "unknown action" }, 400);
    const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (bearer !== SERVICE) return json({ ok: false, error: "service only" }, 401);

    const { data: due, error } = await admin.rpc("web_push_claim_due");
    if (error) throw new Error(`web_push_claim_due: ${error.message}`);
    const rows = (due ?? []) as Due[];
    if (!rows.length) return json({ ok: true, due: 0, sent: 0 });

    const byRep = new Map<string, Due[]>();
    for (const r of rows) byRep.set(r.rep_id, [...(byRep.get(r.rep_id) ?? []), r]);

    const { data: subs, error: sErr } = await admin.from("web_push_subscriptions")
      .select("endpoint, user_id, p256dh, auth").in("user_id", [...byRep.keys()]);
    if (sErr) throw new Error(`subscriptions: ${sErr.message}`);

    const keys = await vapid(admin);
    let sent = 0, gone = 0, failed = 0;
    await Promise.all((subs ?? []).map(async (s) => {
      const items = byRep.get(s.user_id as string) ?? [];
      if (!items.length) return;
      try {
        const r = await sendWebPush(s as { endpoint: string; p256dh: string; auth: string }, message(items), keys, SUBJECT);
        if (r.ok) {
          sent++;
          await admin.from("web_push_subscriptions").update({ last_sent_at: new Date().toISOString() }).eq("endpoint", s.endpoint);
        } else if (r.gone) {
          gone++;
          await admin.from("web_push_subscriptions").delete().eq("endpoint", s.endpoint);
        } else {
          failed++;
          console.error("web-push", r.status, r.body);
        }
      } catch (e) {
        failed++;
        console.error("web-push", String(e));
      }
    }));
    return json({ ok: true, due: rows.length, reps: byRep.size, sent, gone, failed });
  } catch (e) {
    console.error("web-push", String(e));
    return json({ ok: false, error: String(e) }, 500);
  }
});
