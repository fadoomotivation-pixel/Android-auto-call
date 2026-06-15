import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Google OAuth callback: exchange the code for a refresh token, create a
// "SalesAutoCall Recordings" folder, and store both on the company's
// storage_integrations row (super-admin RLS gates the write).
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") ?? "";
  const isPlatform = state === "platform";
  const company = isPlatform ? "" : state;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", url.origin), { status: 303 });
  const { data: pa } = await supabase
    .from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle();

  // Super admin → platform storage page; company admin → recordings.
  const { data: me } = await supabase
    .from("profiles").select("role, company_id").eq("id", user.id).maybeSingle<{ role: string; company_id: string | null }>();
  const back = new URL(pa ? "/dashboard/platform/storage" : "/dashboard/recordings", url.origin);

  if (!code || !state) {
    back.searchParams.set("err", "missing code/state");
    return NextResponse.redirect(back, { status: 303 });
  }
  // Authorize: platform → super admin; company → super admin or that company's admin.
  if (isPlatform) {
    if (!pa) return new NextResponse("Super admin only", { status: 403 });
  } else if (!pa && !(me?.role === "admin" && me.company_id === company)) {
    return new NextResponse("Not authorized", { status: 403 });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
  const redirectUri = `${url.origin}/api/gdrive/callback`;

  try {
    // 1. Exchange code → tokens.
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code, client_id: clientId, client_secret: clientSecret,
        redirect_uri: redirectUri, grant_type: "authorization_code",
      }),
    });
    const tok = await tokenRes.json();
    if (!tok.refresh_token) {
      back.searchParams.set("err", "no refresh_token (revoke prior access and retry)");
      return NextResponse.redirect(back, { status: 303 });
    }

    // 2. Create a dedicated folder for recordings.
    let folderId = "";
    try {
      const f = await fetch("https://www.googleapis.com/drive/v3/files?fields=id", {
        method: "POST",
        headers: { Authorization: `Bearer ${tok.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "SalesAutoCall Recordings", mimeType: "application/vnd.google-apps.folder" }),
      });
      folderId = (await f.json()).id ?? "";
    } catch (_) { /* folder optional */ }

    // 3. Who is this Google account? (for display)
    let email = "";
    try {
      const me = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tok.access_token}` },
      });
      email = (await me.json()).email ?? "";
    } catch (_) { /* optional */ }

    // 4. Persist (RLS allows: platform → super admin; company → its admin/super).
    if (isPlatform) {
      await supabase.from("platform_storage").upsert({
        id: true,
        provider: "gdrive",
        refresh_token: tok.refresh_token,
        folder_id: folderId || null,
        account_email: email || null,
        updated_at: new Date().toISOString(),
      });
    } else {
      await supabase.from("storage_integrations").upsert({
        company_id: company,
        provider: "gdrive",
        refresh_token: tok.refresh_token,
        folder_id: folderId || null,
        account_email: email || null,
        updated_at: new Date().toISOString(),
      });
    }

    back.searchParams.set("ok", "1");
    return NextResponse.redirect(back, { status: 303 });
  } catch (e) {
    back.searchParams.set("err", e instanceof Error ? e.message : "oauth failed");
    return NextResponse.redirect(back, { status: 303 });
  }
}
