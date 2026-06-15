import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Starts the Google Drive OAuth flow. A super admin may connect any company;
// a company admin may connect their OWN company.
// GET /api/gdrive/start?company=<uuid>
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url), { status: 303 });

  const url = new URL(request.url);
  let company = url.searchParams.get("company") ?? "";
  const platform = url.searchParams.get("platform") === "1";

  const { data: pa } = await supabase
    .from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle();

  let state: string;
  if (platform) {
    // Super admin connecting the single platform-wide Drive.
    if (!pa) return new NextResponse("Super admin only", { status: 403 });
    state = "platform";
  } else {
    if (!pa) {
      // Company admin connecting their OWN company.
      const { data: me } = await supabase
        .from("profiles").select("role, company_id").eq("id", user.id).maybeSingle<{ role: string; company_id: string | null }>();
      if (me?.role !== "admin" || !me.company_id) return new NextResponse("Admins only", { status: 403 });
      company = me.company_id;
    }
    if (!company) return new NextResponse("missing company", { status: 400 });
    state = company;
  }

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
  auth.searchParams.set("state", state);
  return NextResponse.redirect(auth.toString());
}
