// Daily retention job: delete recordings older than 30 days from Drive and
// mark them expired. Intended to be called by pg_cron. Protected by a shared
// secret header (deploy with verify_jwt=false).
//
// Header: x-prune-secret must equal the PRUNE_SECRET env.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const G_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") ?? "";
const G_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "";
const PRUNE_SECRET = Deno.env.get("PRUNE_SECRET") ?? "";
const RETENTION_DAYS = 30;

async function driveAccessToken(refreshToken: string): Promise<string> {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: G_CLIENT_ID, client_secret: G_CLIENT_SECRET,
      refresh_token: refreshToken, grant_type: "refresh_token",
    }),
  });
  return (await r.json()).access_token as string;
}

Deno.serve(async (req) => {
  if (PRUNE_SECRET && req.headers.get("x-prune-secret") !== PRUNE_SECRET) {
    return new Response("forbidden", { status: 403 });
  }
  const admin = createClient(SUPABASE_URL, SERVICE);
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86400_000).toISOString();

  const { data: rows } = await admin
    .from("call_logs")
    .select("id, company_id, recording_path")
    .eq("recording_status", "ready")
    .lt("created_at", cutoff)
    .limit(500);

  if (!rows || rows.length === 0) return new Response(JSON.stringify({ ok: true, pruned: 0 }));

  // Cache Drive access tokens per company.
  const tokenCache = new Map<string, string>();
  let pruned = 0;

  for (const r of rows) {
    try {
      if (r.recording_path) {
        let token = tokenCache.get(r.company_id);
        if (!token) {
          const { data: integ } = await admin
            .from("storage_integrations").select("refresh_token").eq("company_id", r.company_id).maybeSingle();
          if (integ?.refresh_token) {
            token = await driveAccessToken(integ.refresh_token);
            tokenCache.set(r.company_id, token);
          }
        }
        if (token) {
          await fetch(`https://www.googleapis.com/drive/v3/files/${r.recording_path}`, {
            method: "DELETE", headers: { Authorization: `Bearer ${token}` },
          });
        }
      }
      await admin.from("call_logs")
        .update({ recording_path: null, recording_status: "expired" }).eq("id", r.id);
      pruned++;
    } catch (_) { /* skip and continue */ }
  }
  return new Response(JSON.stringify({ ok: true, pruned }));
});
