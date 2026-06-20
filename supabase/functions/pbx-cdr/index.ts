// Cloud-call CDR + recording webhook for a self-hosted PBX (FreeSWITCH or Asterisk).
// The PBX records every call server-side, then on hangup POSTs here:
//   headers: x-pbx-secret (company auth), x-pbx-call-id, x-extension,
//            x-direction ('in'|'out'), x-from, x-to, x-duration, x-started-at
//   body:    the recording audio bytes (wav/mp3/m4a) — optional
// Logs the call into call_logs (idempotent on pbx_call_id), uploads the recording
// to Google Drive (company Drive → else platform Drive), and fires the AI summary.
// Public endpoint (a PBX can't send a Supabase JWT) → verify_jwt OFF; the
// x-pbx-secret is the auth.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { hasGroq, summarizeAndStore } from "../_shared/summarize.ts";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-pbx-secret, x-pbx-call-id, x-extension, x-direction, x-from, x-to, x-duration, x-started-at",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(o: unknown, s = 200) {
  return new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
}
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const G_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") ?? "";
const G_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "";
const digits = (s: string) => (s ?? "").replace(/\D/g, "");

async function driveAccessToken(refreshToken: string): Promise<string> {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: G_CLIENT_ID, client_secret: G_CLIENT_SECRET, refresh_token: refreshToken, grant_type: "refresh_token" }),
  });
  const d = await r.json();
  if (!d.access_token) throw new Error(`Google token: ${JSON.stringify(d)}`);
  return d.access_token as string;
}
async function createFolder(token: string, name: string, parent: string | null): Promise<string | null> {
  const f = await fetch("https://www.googleapis.com/drive/v3/files?fields=id", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: parent ? [parent] : undefined }),
  });
  return (await f.json()).id ?? null;
}
async function resolveDrive(admin: SupabaseClient, companyId: string, companyName: string) {
  const { data: ci } = await admin.from("storage_integrations")
    .select("refresh_token, folder_id, platform_subfolder_id").eq("company_id", companyId).maybeSingle();
  if (ci?.refresh_token) return { refreshToken: ci.refresh_token as string, parent: (ci.folder_id as string) ?? null };
  const { data: ps } = await admin.from("platform_storage").select("refresh_token, folder_id").eq("id", true).maybeSingle();
  if (!ps?.refresh_token) return null;
  let sub = (ci?.platform_subfolder_id as string) ?? null;
  if (!sub) {
    const token = await driveAccessToken(ps.refresh_token);
    sub = await createFolder(token, companyName || companyId, (ps.folder_id as string) ?? null);
    if (sub) await admin.from("storage_integrations").upsert({ company_id: companyId, provider: "gdrive", platform_subfolder_id: sub, updated_at: new Date().toISOString() });
  }
  return { refreshToken: ps.refresh_token as string, parent: sub };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  const secret = req.headers.get("x-pbx-secret") ?? "";
  if (!secret) return json({ ok: false, error: "missing x-pbx-secret" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE);
  const { data: cfg } = await admin.from("pbx_config")
    .select("company_id, active").eq("cdr_secret", secret).maybeSingle();
  if (!cfg || !cfg.active) return json({ ok: false, error: "invalid or inactive PBX secret" }, 401);
  const companyId = cfg.company_id;

  const pbxCallId = req.headers.get("x-pbx-call-id") || null;
  const extension = (req.headers.get("x-extension") || "").trim();
  const direction = (req.headers.get("x-direction") || "out").toLowerCase() === "in" ? "incoming" : "outgoing";
  const from = digits(req.headers.get("x-from") || "");
  const to = digits(req.headers.get("x-to") || "");
  const duration = parseInt(req.headers.get("x-duration") || "0", 10) || 0;
  const startedAt = req.headers.get("x-started-at") || new Date().toISOString();
  // The customer is the leg that isn't our rep's extension.
  const customer = direction === "incoming" ? from : to;
  if (!customer) return json({ ok: false, error: "missing customer number (x-from/x-to)" }, 400);

  // Map the PBX extension → the rep; fall back to the lead's owner.
  let salespersonId: string | null = null;
  if (extension) {
    const { data: rep } = await admin.from("profiles").select("id")
      .eq("company_id", companyId).eq("sip_agent_id", extension).maybeSingle();
    salespersonId = rep?.id ?? null;
  }
  const { data: match } = await admin.rpc("wa_match_contact", { p_company: companyId, p_number: customer });
  const m = Array.isArray(match) ? match[0] : null;
  if (!salespersonId) salespersonId = m?.salesperson_id ?? null;

  // Upsert the call row (idempotent on pbx_call_id when present).
  const rowData: Record<string, unknown> = {
    company_id: companyId,
    salesperson_id: salespersonId,
    contact_id: m?.contact_id ?? null,
    phone: customer,
    direction,
    started_at: startedAt,
    duration_seconds: duration,
    recording_source: "cloud",
    pbx_call_id: pbxCallId,
  };
  let callId: string | null = null;
  if (pbxCallId) {
    const { data: up } = await admin.from("call_logs")
      .upsert(rowData, { onConflict: "pbx_call_id" }).select("id").maybeSingle();
    callId = up?.id ?? null;
  } else {
    const { data: ins } = await admin.from("call_logs").insert(rowData).select("id").maybeSingle();
    callId = ins?.id ?? null;
  }
  if (!callId) return json({ ok: false, error: "failed to log call" }, 200);

  // Recording (optional body). Upload to Drive + fire AI summary.
  let fileId: string | null = null;
  try {
    const bytes = new Uint8Array(await req.arrayBuffer());
    if (bytes.length > 0) {
      const { data: comp } = await admin.from("companies").select("name").eq("id", companyId).maybeSingle();
      const drive = await resolveDrive(admin, companyId, comp?.name ?? "");
      if (!drive) {
        await admin.from("call_logs").update({ recording_status: "failed" }).eq("id", callId);
      } else {
        const token = await driveAccessToken(drive.refreshToken);
        const ct = req.headers.get("content-type") || "audio/wav";
        const ext = ct.includes("mpeg") || ct.includes("mp3") ? "mp3" : ct.includes("mp4") || ct.includes("m4a") ? "m4a" : "wav";
        const metadata = { name: `${callId}.${ext}`, mimeType: ct, parents: drive.parent ? [drive.parent] : undefined };
        const boundary = "pbx" + crypto.randomUUID().replace(/-/g, "");
        const enc = new TextEncoder();
        const pre = enc.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` + JSON.stringify(metadata) + `\r\n--${boundary}\r\nContent-Type: ${ct}\r\n\r\n`);
        const post = enc.encode(`\r\n--${boundary}--`);
        const body = new Uint8Array(pre.length + bytes.length + post.length);
        body.set(pre, 0); body.set(bytes, pre.length); body.set(post, pre.length + bytes.length);
        const upr = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", {
          method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` }, body,
        });
        const upj = await upr.json();
        if (upr.ok && upj.id) {
          fileId = upj.id;
          await admin.from("call_logs").update({ recording_path: upj.id, recording_status: "ready", recording_seconds: duration, recording_source: "cloud" }).eq("id", callId);
          if (hasGroq()) {
            const task = summarizeAndStore(admin, callId, bytes, "sip");
            if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(task); else await task;
          }
        } else {
          await admin.from("call_logs").update({ recording_status: "failed" }).eq("id", callId);
        }
      }
    }
  } catch (_) { /* recording is best-effort; the call is already logged */ }

  return json({ ok: true, call_id: callId, recording_file_id: fileId });
});
