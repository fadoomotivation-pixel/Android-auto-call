// Tracked content link (public): a buyer clicks a brochure/video/review link the
// rep shared, we log the open + reactivate the lead, then 302 to the real asset.
//
//   GET /functions/v1/content-open?t=<token>
//
// verify_jwt must be OFF (the buyer clicking the link has no Supabase JWT).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get("t") ?? "";
  if (!token) return new Response("missing token", { status: 400 });

  const admin = createClient(SUPABASE_URL, SERVICE);
  // register_content_open: logs the open, reactivates the lead, returns asset URL.
  const { data, error } = await admin.rpc("register_content_open", { p_token: token });
  const target = typeof data === "string" && data.length > 0 ? data : null;
  if (error || !target) return new Response("link not found", { status: 404 });

  return new Response(null, { status: 302, headers: { Location: target } });
});
