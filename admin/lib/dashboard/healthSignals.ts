/**
 * The three things that, when broken, make the CRM quietly lie.
 *
 *   WhatsApp capture — a logged-out session records nothing and cannot be
 *                      fetched later (wa_rep_sessions + classifyCapture, the
 *                      same rule the outage notice uses).
 *   Phone app        — a phone whose call-log sync stopped or has no
 *                      permission (v_device_sync_health, as on Phone Health).
 *   Recordings       — calls in the last 24 hours whose recording failed to
 *                      arrive (call_logs.recording_status = 'failed', as on
 *                      the Recordings page).
 *
 * Every read goes through the signed-in user's client, so RLS keeps a company
 * admin inside their company and a super admin sees every company.
 *
 * A read that fails is "unknown", never "ok". Silence must never look like
 * success.
 */
import type { createClient } from "@/lib/supabase/server";
import { classifyCapture } from "@/lib/capture-health";

type Client = Awaited<ReturnType<typeof createClient>>;

export type SignalState = "ok" | "bad" | "unknown";

export type HealthSignal = {
  id: "whatsapp" | "phone" | "recordings";
  label: string;
  state: SignalState;
  /** One plain line: what is wrong, or why we do not know. */
  line: string;
  /** Where to fix it. */
  href: string;
};

export type HealthSummary = {
  state: SignalState;
  signals: HealthSignal[];
  checkedAt: string;
};

const BAD_PHONE = new Set(["no_permission", "stale", "broken"]);

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export async function readHealthSignals(supabase: Client): Promise<HealthSummary> {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();

  const [wa, phones, recs] = await Promise.all([
    supabase.from("wa_rep_sessions").select("salesperson_id, status, last_seen_at, last_error")
      .returns<{ salesperson_id: string; status: string; last_seen_at: string | null; last_error: string | null }[]>(),
    supabase.from("v_device_sync_health").select("salesperson_id, state")
      .returns<{ salesperson_id: string; state: string }[]>(),
    supabase.from("call_logs").select("id", { count: "exact", head: true })
      .eq("recording_status", "failed").gte("started_at", since),
  ]);

  const signals: HealthSignal[] = [];

  if (wa.error) {
    signals.push({ id: "whatsapp", label: "WhatsApp capture", state: "unknown",
      line: "Could not read WhatsApp capture status. This is not saying it is up.", href: "/dashboard/health#whatsapp-capture" });
  } else {
    const dead = (wa.data ?? []).filter((r) => classifyCapture(r) !== null).length;
    const total = (wa.data ?? []).length;
    signals.push(dead > 0
      ? { id: "whatsapp", label: "WhatsApp capture", state: "bad",
          line: `${plural(dead, "phone")} not capturing WhatsApp. Messages sent now are lost.`, href: "/dashboard/health#whatsapp-capture" }
      : total === 0
        ? { id: "whatsapp", label: "WhatsApp capture", state: "unknown",
            line: "No WhatsApp is linked yet, so nothing is being captured.", href: "/dashboard/whatsapp" }
        : { id: "whatsapp", label: "WhatsApp capture", state: "ok",
            line: `All ${plural(total, "linked phone")} capturing.`, href: "/dashboard/health#whatsapp-capture" });
  }

  if (phones.error) {
    signals.push({ id: "phone", label: "Phone app", state: "unknown",
      line: "Could not read phone sync status.", href: "/dashboard/health#phone-sync" });
  } else {
    const rows = phones.data ?? [];
    const bad = rows.filter((r) => BAD_PHONE.has(r.state)).length;
    signals.push(bad > 0
      ? { id: "phone", label: "Phone app", state: "bad",
          line: `${plural(bad, "phone")} not sending calls to the CRM.`, href: "/dashboard/health#phone-sync" }
      : rows.length === 0
        ? { id: "phone", label: "Phone app", state: "unknown",
            line: "No phone has reported yet.", href: "/dashboard/health#phone-sync" }
        : { id: "phone", label: "Phone app", state: "ok",
            line: "Every phone that reports is syncing.", href: "/dashboard/health#phone-sync" });
  }

  if (recs.error) {
    signals.push({ id: "recordings", label: "Recordings", state: "unknown",
      line: "Could not read failed recordings.", href: "/dashboard/recordings" });
  } else {
    const failed = recs.count ?? 0;
    signals.push(failed > 0
      ? { id: "recordings", label: "Recordings", state: "bad",
          line: `${plural(failed, "recording")} failed in the last 24 hours.`, href: "/dashboard/recordings" }
      : { id: "recordings", label: "Recordings", state: "ok",
          line: "No failed recordings in the last 24 hours.", href: "/dashboard/recordings" });
  }

  // The nav dot: red when anything is broken, grey when a read failed (we do
  // not know), nothing when all three were read and none is broken. "No
  // WhatsApp linked yet" is a setup fact shown on the Health page, not an alarm.
  const readFailed = !!(wa.error || phones.error || recs.error);
  const state: SignalState = signals.some((s) => s.state === "bad") ? "bad" : readFailed ? "unknown" : "ok";

  return { state, signals, checkedAt: new Date().toISOString() };
}
