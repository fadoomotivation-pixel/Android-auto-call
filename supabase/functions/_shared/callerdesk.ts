// Shared helpers for the CallerDesk cloud-telephony edge functions.
// CallerDesk = click-to-call PSTN bridge: we POST agent + customer numbers, it
// rings the agent's mobile, bridges the customer, records server-side, and fires
// a webhook with the result.
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export const CALLERDESK_CLICK_TO_CALL = "https://app.callerdesk.io/api/click_to_call_v2";

export function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE);
}

/** Normalise an Indian phone number to its 10-digit subscriber form (CallerDesk
 *  expects the agent number without country code). Tolerant of +91 / 0 prefixes
 *  and spaces. Returns whatever digits remain if it's not a clean 10-digit. */
export function tenDigit(raw: string | null | undefined): string {
  const d = (raw ?? "").replace(/\D/g, "");
  if (d.length > 10 && d.startsWith("91")) return d.slice(-10);
  if (d.length === 11 && d.startsWith("0")) return d.slice(1);
  return d.length >= 10 ? d.slice(-10) : d;
}

/** First non-empty value across a list of candidate keys (case-insensitive),
 *  searching nested objects one level deep. Used to read CallerDesk webhook
 *  fields whose exact names vary by account/plan. */
export function pick(obj: Record<string, unknown>, keys: string[]): string | null {
  const lower: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) lower[k.toLowerCase()] = v;
  for (const key of keys) {
    const v = lower[key.toLowerCase()];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  // one level deep (some providers nest under "data"/"call")
  for (const v of Object.values(obj)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const r = pick(v as Record<string, unknown>, keys);
      if (r) return r;
    }
  }
  return null;
}
