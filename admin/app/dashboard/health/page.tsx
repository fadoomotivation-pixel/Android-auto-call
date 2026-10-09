import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { readHealthSignals } from "@/lib/dashboard/healthSignals";
import { CaptureOutageDetails } from "../CaptureOutageBanner";
import type { Profile } from "@/lib/types";
import { PhoneHealth } from "./PhoneHealth";
import { SyncHeartbeat } from "./SyncHeartbeat";

/**
 * Phone Health — why a telecaller's calls are (or aren't) reaching the CRM.
 *
 * Outgoing calls always arrive; incoming, missed and off-CRM calls only arrive
 * if the phone's background call-log sync is alive. When it isn't, the dashboard
 * looks normal and inbound simply disappears — invisible from the server until
 * now. This names the phone and gives the exact settings fix, which is a phone
 * change, not an app release.
 *
 * Super admin sees every company; a company admin only their own team —
 * enforced inside the call_capture_health SQL function.
 */
export default async function HealthPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: me }, { data: pa }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user!.id).maybeSingle<Pick<Profile, "role">>(),
    supabase.from("platform_admins").select("user_id").eq("user_id", user!.id).maybeSingle(),
  ]);
  const isSuper = !!pa;
  if (me?.role !== "admin" && !isSuper) {
    return <><h2>📶 Phone Health</h2><div className="empty">Managers only.</div></>;
  }

  return (
    <>
      <h2>📶 Health</h2>
      <p className="subtitle">
        <strong>Three things must work for the CRM to tell the truth:</strong> WhatsApp capture, the phone
        app, and recordings. A red dot next to Health in the sidebar means one of these is broken.
      </p>
      <Suspense fallback={<div className="card health-summary-pending">Checking WhatsApp, phones and recordings…</div>}>
        <HealthSummaryCards />
      </Suspense>

      <h3 className="section-h" id="whatsapp-capture">WhatsApp capture</h3>
      <Suspense fallback={<p className="subtitle">Checking WhatsApp capture. Not a result yet.</p>}>
        <CaptureOutageDetails />
      </Suspense>

      <h3 className="section-h" id="phone-sync">Phone app</h3>
      <p className="subtitle">
        <strong>Is each phone actually feeding the CRM?</strong> Outgoing calls always arrive; incoming,
        missed and off-CRM calls only arrive if the phone&apos;s background sync is alive. When it isn&apos;t,
        this names the phone and gives the exact settings fix — a phone change, not an app release.
      </p>
      <p className="subtitle" style={{ marginTop: -8, fontSize: 12.5 }}>
        For what a rep actually did today see <a href="/dashboard/pulse" style={{ color: "var(--accent)" }}>Daily Pulse</a>.
      </p>
      <PhoneHealth isSuper={isSuper} />
      <SyncHeartbeat />
    </>
  );
}

/** The same three signals the sidebar dot reads, spelled out. */
async function HealthSummaryCards() {
  const supabase = await createClient();
  const h = await readHealthSignals(supabase);
  return (
    <div className="health-summary">
      {h.signals.map((s) => (
        <div key={s.id} className="card health-signal">
          <i className={`nav-dot is-${s.state}`} aria-hidden />
          <div>
            <strong>{s.label}{s.state === "ok" ? " · OK" : s.state === "bad" ? " · Needs a fix" : " · Not known"}</strong>
            <p>{s.line}</p>
            {s.state !== "ok" && <a href={s.href}>Open →</a>}
          </div>
        </div>
      ))}
    </div>
  );
}
