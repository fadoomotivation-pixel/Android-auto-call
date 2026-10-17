import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Google sign-in and the email-confirmation link both land here with ?code=.
// New user without a company → /signup/company. Otherwise load demo leads if
// they asked for them (idempotent RPC, migration 0226) and open the dashboard.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const demo = url.searchParams.get("demo") === "1";
  const to = (path: string) => NextResponse.redirect(new URL(path, url.origin));

  if (!code) return to("/login");

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return to("/login");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return to("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.company_id) return to(`/signup/company${demo ? "?demo=1" : "?demo=0"}`);

  if (demo || user.user_metadata?.load_demo === true) {
    await supabase.rpc("load_demo_leads").then(() => undefined, () => undefined);
  }
  return to("/dashboard/actions");
}
