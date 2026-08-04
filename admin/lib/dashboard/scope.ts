/**
 * Who is asking, and which company they are allowed to see.
 *
 * Thirty pages of this dashboard open with the same twelve lines: fetch the
 * user, fetch their profile, fetch platform_admins, decide isSuper, bounce
 * non-admins, then derive a company filter from `?company=`. Thirty copies of
 * a rule is thirty chances to get it wrong once — and the way it gets wrong is
 * always the same, because the wrong version is the shorter one:
 *
 *     const scope = me.company_id;          // WRONG for the super admin
 *     const scope = isSuper ? sp.company ?? null : me.company_id;   // right
 *
 * The first line looks reasonable and quietly turns the platform owner into an
 * admin of whichever tenant their profile happens to sit in — for this product
 * that is the "ankit" company, and every number on the page silently becomes
 * one customer's numbers presented as the whole business. That failure has no
 * error message and no red build. It just shows you a smaller world.
 *
 * So the rule lives here once.
 *
 * WHAT THIS IS NOT. It is not a security boundary. Every table and view these
 * pages read already carries its own RLS, and that is what actually enforces
 * isolation — a company admin cannot read another tenant's rows even if this
 * function returned the wrong id. This is about the DEFAULT VIEW being honest,
 * and about not writing the ternary a thirty-first time.
 */
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Scope = {
  /**
   * The server client this scope was resolved with. Handed back so a page does
   * not build a second one: resolving identity already needed a client, and two
   * per request is two round trips of cookie parsing for no reason.
   */
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  /** True for the platform owner: sees every company, is pinned to none. */
  isSuper: boolean;
  /** 'admin' for a company admin. Telecallers never reach these pages. */
  role: string | null;
  /** The company this account belongs to. NOT the company being viewed. */
  homeCompanyId: string | null;
  /**
   * The company being viewed, or null for "all of them".
   *
   * Null means all companies ONLY for the super admin. For a company admin it
   * can never be null — they always have exactly one, and `companyId` is it.
   */
  companyId: string | null;
  /** `?company=<id>` to carry the current scope onto a link. "" when unscoped. */
  query: string;
};

/**
 * Resolve the caller and the company they are looking at.
 *
 * @param search The page's resolved searchParams. Only `company` is read.
 * @param opts.require  'admin' (default) redirects a telecaller to /dashboard —
 *                      everyone lands there after login, so they must be sent
 *                      onward rather than shown a locked door.
 *                      'any' returns the scope without redirecting, for pages
 *                      that render something useful for a rep too.
 */
export async function resolveScope(
  search?: { company?: string },
  opts: { require?: "admin" | "any" } = {},
): Promise<Scope> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: me }, { data: pa }] = await Promise.all([
    supabase.from("profiles").select("role, company_id").eq("id", user.id)
      .maybeSingle<{ role: string; company_id: string | null }>(),
    supabase.from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle(),
  ]);

  const isSuper = !!pa;
  const role = me?.role ?? null;
  const homeCompanyId = me?.company_id ?? null;

  if ((opts.require ?? "admin") === "admin" && role !== "admin" && !isSuper) {
    redirect("/dashboard");
  }

  // THE LINE. A super admin defaults to every company and narrows only when
  // asked; anyone else is their own company and nothing else.
  const companyId = isSuper ? (search?.company ?? null) : homeCompanyId;

  return {
    supabase,
    userId: user.id,
    isSuper,
    role,
    homeCompanyId,
    companyId,
    query: companyId ? `?company=${companyId}` : "",
  };
}

/**
 * Apply the scope to a PostgREST query.
 *
 * Written as a pass-through so a chain reads in one line:
 *
 *     const q = scoped(supabase.from("contacts").select("id"), scope);
 *
 * Filters on nothing when the super admin is viewing all companies, which is
 * the correct behaviour and the one people forget to allow for.
 */
export function scoped<T extends { eq: (col: string, val: string) => T }>(
  query: T,
  scope: Pick<Scope, "companyId">,
  column = "company_id",
): T {
  return scope.companyId ? query.eq(column, scope.companyId) : query;
}

/** Carry the current company onto an internal link. */
export function withScope(href: string, scope: Pick<Scope, "query">): string {
  if (!scope.query) return href;
  return href + (href.includes("?") ? "&" : "?") + scope.query.slice(1);
}
