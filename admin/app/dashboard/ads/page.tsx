import { createClient } from "@/lib/supabase/server";
import { AdsManager } from "./AdsManager";

// Ads Manager — one place to see every Meta campaign's performance AND its real
// CRM outcome. Central account, so it's a super-admin surface (the platform runs
// the ads; leads route to each company).
export default async function AdsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: prof }, { data: pa }] = await Promise.all([
    supabase.from("profiles").select("company_id").eq("id", user!.id).maybeSingle<{ company_id: string | null }>(),
    supabase.from("platform_admins").select("user_id").eq("user_id", user!.id).maybeSingle(),
  ]);
  const isSuper = !!pa;

  if (!isSuper) {
    return (
      <>
        <h2>📈 Ads Manager</h2>
        <div className="empty">
          Ads are run from one central account managed by your platform admin. Your Facebook leads still flow into
          the CRM automatically — see them under Facebook Leads and Lead Management.
        </div>
      </>
    );
  }

  const hub = prof?.company_id ?? null;
  const { data: integ } = hub
    ? await supabase.from("facebook_integrations").select("ad_account_id, ads_token_secret_id").eq("company_id", hub).maybeSingle<{ ad_account_id: string | null; ads_token_secret_id: string | null }>()
    : { data: null };
  const configured = !!(integ?.ad_account_id && integ?.ads_token_secret_id);

  return (
    <>
      <h2 style={{ marginBottom: 4 }}>📈 Ads Manager</h2>
      <p className="subtitle" style={{ marginTop: 0 }}>
        Every Meta campaign in one view — with the real CRM result of each ad (Interested, Booked), not just form-fills.
      </p>
      {hub ? (
        <AdsManager companyId={hub} configured={configured} savedAccount={integ?.ad_account_id ?? null} />
      ) : (
        <div className="empty">Your super-admin account isn&apos;t linked to a company yet.</div>
      )}
    </>
  );
}
