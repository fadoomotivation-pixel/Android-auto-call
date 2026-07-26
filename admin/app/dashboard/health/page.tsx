import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import { PhoneHealth } from "./PhoneHealth";

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
      <h2>📶 Phone Health</h2>
      <p className="subtitle">
        Har telecaller ka phone CRM ko sahi feed kar raha hai ya nahi. Agar incoming ya recording kam dikh rahi
        hai, wajah aur exact fix yahan milega — phone settings ka, app update ka nahi.
      </p>
      <PhoneHealth isSuper={isSuper} />
    </>
  );
}
