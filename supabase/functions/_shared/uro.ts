// Shared helpers for the UrOperator cloud-calling edge functions.
// One place for CORS, the authenticated-user lookup, and loading a company's
// UrOperator integration (token + SIP config) via the service role.
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

export interface Caller {
  /** anon client carrying the caller's JWT (RLS applies to its reads) */
  u: SupabaseClient;
  /** service-role client (bypasses RLS — only for reading secrets server-side) */
  admin: SupabaseClient;
  userId: string;
}

/** Resolves the authenticated caller, or returns a 401 Response. */
export async function requireUser(req: Request): Promise<Caller | Response> {
  const auth = req.headers.get("Authorization") ?? "";
  const u = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
  const { data } = await u.auth.getUser();
  if (!data?.user) return json({ ok: false, error: "Unauthorized" }, 401);
  const admin = createClient(SUPABASE_URL, SERVICE);
  return { u, admin, userId: data.user.id };
}

export interface Integration {
  company_id: string;
  uro_token: string | null;
  uro_tenant_id: string | null;
  default_caller_id: string | null;
  sip_server: string;
  sip_port: number;
  transport: string;
  wss_url: string | null;
  outbound_proxy: string | null;
  api_base_url: string;
}

export interface MyProfile {
  company_id: string | null;
  role: string;
  sip_agent_id: string | null;
  caller_id: string | null;
  sip_server: string | null;
  sip_port: number | null;
}

/** The caller's own profile (read under RLS — they can always see their own row). */
export async function myProfile(c: Caller): Promise<MyProfile | null> {
  const { data } = await c.u
    .from("profiles")
    .select("company_id, role, sip_agent_id, caller_id, sip_server, sip_port")
    .eq("id", c.userId)
    .maybeSingle();
  return (data as MyProfile) ?? null;
}

/** Loads a company's UrOperator integration via the service role. */
export async function loadIntegration(c: Caller, companyId: string): Promise<Integration | null> {
  const { data } = await c.admin
    .from("company_integrations")
    .select("*")
    .eq("company_id", companyId)
    .maybeSingle();
  return (data as Integration) ?? null;
}

/** Headers required by every UrOperator API request. */
export function uroHeaders(token: string): Record<string, string> {
  return { "X-API-Token": token, "Content-Type": "application/json" };
}
