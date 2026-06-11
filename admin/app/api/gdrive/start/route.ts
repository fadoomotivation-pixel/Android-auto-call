import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Super-admin starts the Google Drive OAuth flow for a company.
// GET /api/gdrive/start?company=<uuid>
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url), { status: 303 });

  const { data: pa } = await supabase
    .from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!pa) return new NextResponse("Super admin only", { status: 403 });

  const url = new URL(request.url);
  const company = url.searchParams.get("company") ?? "";
  if (!company) return new NextResponse("missing company", { status: 400 });

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return new NextResponse("GOOGLE_CLIENT_ID not configured", { status: 500 });

  const redirectUri = `${url.origin}/api/gdrive/callback`;
  const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  auth.searchParams.set("client_id", clientId);
  auth.searchParams.set("redirect_uri", redirectUri);
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set("scope", "https://www.googleapis.com/auth/drive.file");
  auth.searchParams.set("access_type", "offline");
  auth.searchParams.set("prompt", "consent");
  auth.searchParams.set("state", company);
  return NextResponse.redirect(auth.toString());
}
