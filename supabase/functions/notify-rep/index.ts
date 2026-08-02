// Sends an FCM (HTTP v1) push to a rep's registered devices — e.g. "new hot
// lead, call now". Mints an OAuth access token from the Firebase service
// account stored in Vault (get_fcm_service_account), then posts to FCM.
//
// Body: { user_ids?: string[], company_id?: string, contact_id?: string,
//         title: string, body: string, data?: Record<string,string> }
//
// Auth: the service role key (server/trigger callers) OR an authenticated
// company admin (targets are then forced to their own company).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(o: unknown, s = 200) {
  return new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
}

function b64url(data: Uint8Array | string): string {
  const bin = typeof data === "string" ? data : String.fromCharCode(...data);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToBuf(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

// Service account → short-lived OAuth access token for the FCM scope.
async function fcmAccessToken(sa: { client_email: string; private_key: string; token_uri: string }): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: sa.token_uri,
    iat: now,
    exp: now + 3600,
  }));
  const signingInput = `${header}.${claims}`;
  const key = await crypto.subtle.importKey(
    "pkcs8", pemToBuf(sa.private_key), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(signingInput)));
  const jwt = `${signingInput}.${b64url(sig)}`;
  const r = await fetch(sa.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  const d = await r.json();
  if (!d.access_token) throw new Error(`fcm token: ${JSON.stringify(d)}`);
  return d.access_token as string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const admin = createClient(SUPABASE_URL, SERVICE);

  const auth = req.headers.get("Authorization") ?? "";
  const bearer = auth.replace(/^Bearer\s+/i, "").trim();
  const isServer = bearer === SERVICE;

  const body = await req.json().catch(() => ({}));
  const { user_ids, company_id, contact_id, title, body: text, data, channel } = body ?? {};
  if (!title || !text) return json({ ok: false, error: "title and body required" }, 400);
  // Which Android notification channel to ring on (must exist on device).
  const channelId = typeof channel === "string" && channel ? channel : "hot_leads";

  // Resolve who we're allowed to target.
  let targetUserIds: string[] | null = Array.isArray(user_ids) ? user_ids : null;
  let scopeCompany: string | null = company_id ?? null;
  if (!isServer) {
    const u = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
    const { data: ud } = await u.auth.getUser();
    if (!ud?.user) return json({ ok: false, error: "Unauthorized" }, 401);
    const { data: me } = await admin.from("profiles").select("role, company_id").eq("id", ud.user.id).maybeSingle();
    if (me?.role !== "admin") return json({ ok: false, error: "Admins only" }, 403);
    scopeCompany = me.company_id; // force to caller's company
  }

  // Pull the device tokens to notify.
  let q = admin.from("device_tokens").select("token, user_id, company_id");
  if (targetUserIds && targetUserIds.length) q = q.in("user_id", targetUserIds);
  if (scopeCompany) q = q.eq("company_id", scopeCompany);
  const { data: rows } = await q;

  // Company cross-check: drop any token whose stamped company no longer matches
  // the user's CURRENT profile company. A stale row (old login on a shared
  // phone, a user moved between companies) must never leak one company's lead
  // pushes onto another company's device.
  const userIds = [...new Set((rows ?? []).map((r) => r.user_id as string))];
  const { data: profs } = userIds.length
    ? await admin.from("profiles").select("id, company_id").in("id", userIds)
    : { data: [] };
  const companyOf = new Map((profs ?? []).map((p) => [p.id as string, p.company_id as string | null]));
  const tokens = (rows ?? [])
    .filter((r) => {
      const pc = companyOf.get(r.user_id as string);
      return pc !== undefined && String(r.company_id ?? "") === String(pc ?? "");
    })
    .map((r) => r.token as string);
  if (!tokens.length) return json({ ok: true, sent: 0, note: "no devices" });

  // Mint the FCM access token.
  const { data: saText, error: saErr } = await admin.rpc("get_fcm_service_account");
  if (saErr || !saText) return json({ ok: false, error: "service account unavailable" }, 500);
  const sa = JSON.parse(saText as string);
  const accessToken = await fcmAccessToken(sa).catch((e) => { console.error(e); return null; });
  if (!accessToken) return json({ ok: false, error: "could not authenticate with FCM" }, 502);

  const url = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;
  // DATA-ONLY. There must be no `notification` block below, and this is the
  // reason why.
  //
  // Firebase treats the two payload shapes completely differently on Android:
  // if a message carries a `notification` block, the FCM SDK draws the
  // notification ITSELF whenever the app is not in the foreground, and
  // onMessageReceived() is never called. Our own handler — the cha-ching
  // channel, the "📞 Call Now" button, the tap that opens that exact lead — was
  // therefore running only while the rep already had the app open, and being
  // skipped entirely the rest of the time. That is precisely backwards: a rep
  // staring at the app does not need to be told a lead arrived.
  //
  // It is also why the same event looked like two different features. Reps said
  // "sometimes our notification rings, sometimes it's the phone's one" — app
  // open gave them ours, app in the pocket gave them Android's plain one with
  // no Call button and no lead behind the tap. One push, two behaviours,
  // depending on something the rep cannot see.
  //
  // With data-only, onMessageReceived() runs in every state and draws the same
  // notification every time. The title and body travel in `data` because that
  // is now the only place the handler can read them from.
  //
  // The honest cost: Android does not deliver data-only messages to an app the
  // user has force-stopped, and aggressive OEM battery managers can delay them.
  // A notification payload would still have shown in those cases — but it would
  // have shown as the wrong notification, without the Call button, which is the
  // bug being fixed. Consistency is worth more here than the rare force-stopped
  // phone, and `priority: high` is what keeps the delay honest.
  const payloadData: Record<string, string> = { ...(data ?? {}) };
  if (contact_id) payloadData.contact_id = String(contact_id);
  payloadData.channel = channelId; // which channel the handler should ring on
  payloadData.title = String(title);
  payloadData.body = String(text);

  let sent = 0;
  const dead: string[] = [];
  await Promise.all(tokens.map(async (token) => {
    const r = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          token,
          data: payloadData,
          android: { priority: "high" },
        },
      }),
    });
    if (r.ok) { sent++; return; }
    // Drop tokens FCM says are gone, so the table stays clean.
    if (r.status === 404 || r.status === 400) dead.push(token);
    else console.error(`fcm ${r.status}: ${await r.text()}`);
  }));

  if (dead.length) await admin.from("device_tokens").delete().in("token", dead);
  return json({ ok: true, sent, pruned: dead.length });
});
