import { getServiceSupabase } from "@/lib/supabase/service";

/**
 * Login emails for these user ids, read from Supabase Auth on the server.
 * Server components only: it holds the service key.
 *
 * The email is the login and lives only in auth.users, which the browser can't
 * read. The caller passes ids it has already scoped (a company admin's own
 * team, or the super admin's list), and only those ids come back.
 */
export async function loginEmails(ids: string[]): Promise<Map<string, string>> {
  const want = new Set(ids);
  const out = new Map<string, string>();
  if (want.size === 0) return out;
  const auth = getServiceSupabase().auth.admin;
  for (let page = 1; page <= 20 && out.size < want.size; page++) {
    const { data, error } = await auth.listUsers({ page, perPage: 1000 });
    if (error || !data) break;
    for (const u of data.users) if (want.has(u.id) && u.email) out.set(u.id, u.email);
    if (data.users.length < 1000) break;
  }
  return out;
}
