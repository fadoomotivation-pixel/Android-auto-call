import { Suspense } from "react";
import { resolveScope } from "@/lib/dashboard/scope";
import { RouteSkeleton } from "../skeletons";
import { AdsManager, type AdsSnapshot } from "./AdsManager";

// Ads Manager — one place to see every Meta campaign's performance AND its real
// CRM outcome. Central account, so it's a super-admin surface (the platform runs
// the ads; leads route to each company).
export default function AdsPage() {
  return (
    <Suspense fallback={<RouteSkeleton title="Ads Manager" />}>
      <AdsBody />
    </Suspense>
  );
}

async function AdsBody() {
  // require "any": a telecaller used to see the explanation, not a redirect.
  const scope = await resolveScope(undefined, { require: "any" });
  const isSuper = scope.isSuper;

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

  // The ads token lives on the super admin's own company row because there is
  // one central ad account. This is not the company being viewed.
  const hub = scope.homeCompanyId;
  const { data: integ } = hub
    ? await scope.supabase.from("facebook_integrations")
        .select("ad_account_id, ads_token_secret_id")
        .eq("company_id", hub)
        .maybeSingle<{ ad_account_id: string | null; ads_token_secret_id: string | null }>()
    : { data: null };
  const configured = !!(integ?.ad_account_id && integ?.ads_token_secret_id);

  return (
    <>
      <h2 style={{ marginBottom: 4 }}>📈 Ads Manager</h2>
      <p className="subtitle" style={{ marginTop: 0 }}>
        Every Meta campaign in one view — with the real CRM result of each ad (Interested, Booked), not just form-fills.
      </p>
      {hub ? (
        <Suspense fallback={<RouteSkeleton title="Ads Manager" bare />}>
          <AdsNumbers hub={hub} configured={configured} savedAccount={integ?.ad_account_id ?? null} />
        </Suspense>
      ) : (
        <div className="empty">Your super-admin account isn&apos;t linked to a company yet.</div>
      )}
    </>
  );
}

async function AdsNumbers({
  hub, configured, savedAccount,
}: {
  hub: string;
  configured: boolean;
  savedAccount: string | null;
}) {
  const { supabase } = await resolveScope(undefined, { require: "any" });
  let initial: AdsSnapshot | null = null;
  if (configured) {
    // Current period only. The comparison window is a second Meta call and
    // must not hold the table. The client starts it after this paint.
    const cur = await supabase.functions.invoke<{ ok: boolean; error?: string; currency?: string; rows?: AdsSnapshot["rows"] }>(
      "ads-insights",
      { body: { company: hub, date_preset: "last_30d" } },
    );
    if (cur.error || !cur.data?.ok) {
      initial = {
        rows: [],
        currency: "",
        prev: null,
        error: cur.data?.error || cur.error?.message || "Couldn't load ads data.",
      };
    } else {
      initial = {
        rows: cur.data.rows ?? [],
        currency: cur.data.currency ?? "",
        prev: null,
        error: null,
      };
    }
  }

  return <AdsManager companyId={hub} configured={configured} savedAccount={savedAccount} initial={initial} />;
}
