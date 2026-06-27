import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isAuthRoute = path.startsWith("/login");
  // Publicly reachable without signing in: the marketing landing page (root) and
  // the Play-required privacy policy. These must NEVER touch Supabase/auth, so a
  // missing env var or an auth-backend hiccup at the edge can't 500 the site.
  const isPublicRoute = path === "/" || path.startsWith("/privacy");
  if (isPublicRoute) return NextResponse.next({ request });

  // No Supabase env configured (e.g. a preview without env vars) → don't crash
  // the whole app with MIDDLEWARE_INVOCATION_FAILED; just let the request pass.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.next({ request });

  try {
    let supabaseResponse = NextResponse.next({ request });
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user && !isAuthRoute) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/login";
      return NextResponse.redirect(redirectUrl);
    }

    if (user && isAuthRoute) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/dashboard";
      return NextResponse.redirect(redirectUrl);
    }

    return supabaseResponse;
  } catch {
    // Auth backend unreachable — fail safe: send non-login routes to /login
    // rather than 500-ing the request.
    if (!isAuthRoute) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/login";
      return NextResponse.redirect(redirectUrl);
    }
    return NextResponse.next({ request });
  }
}
