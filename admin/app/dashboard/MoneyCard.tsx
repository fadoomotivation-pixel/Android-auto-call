/**
 * The morning money card: what the ads cost, what they brought, and whether
 * that is getting better or worse. Last 7 days against the 7 days before.
 *
 * Every number comes from data the product already has:
 *   · Ad spend and bookings from ads — the ads-insights function, the same
 *     read Ads Manager does (Meta spend + leads from those ads now Booked).
 *   · Tokens paid — contacts.token_paid_at, any lead source, scoped by RLS
 *     and by the company being viewed.
 *
 * A number we cannot stand behind is "—" with the reason under it. Never a
 * zero we did not measure.
 */
import Link from "next/link";
import { istToday, rupees } from "@/lib/dashboard/format";
import type { Scope } from "@/lib/dashboard/scope";

type AdRow = { spend: number; crm_booked: number };
type AdsAnswer = { ok: boolean; error?: string; currency?: string; rows?: AdRow[] };
type Period = { since: string; until: string };

type Cell = {
  key: string;
  value: string;
  /** Change line under the value, or null. */
  delta: { text: string; tone: "good" | "bad" | "plain" } | null;
  /** Why there is no number. Only set when value is "—". */
  why?: string;
};

const DASH = "—";

/** Today and the six days before, then the seven before that. IST dates. */
function periods(): { cur: Period; prev: Period } {
  return {
    cur: { since: istToday(-6), until: istToday(0) },
    prev: { since: istToday(-13), until: istToday(-7) },
  };
}

function money(n: number, currency: string): string {
  if (!currency || currency === "INR") return rupees(n);
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
  } catch {
    return `${currency} ${Math.round(n).toLocaleString("en-IN")}`;
  }
}

/**
 * "▲ 12% vs last week". `upIsGood` null means neither direction is good or
 * bad on its own (spend). No previous number means nothing to compare.
 */
function change(cur: number, prev: number | null, upIsGood: boolean | null): Cell["delta"] {
  if (prev === null) return { text: "No figure for the 7 days before", tone: "plain" };
  if (prev === 0) return cur === 0 ? { text: "Same as the 7 days before", tone: "plain" } : { text: "Up from none the 7 days before", tone: upIsGood === null ? "plain" : upIsGood ? "good" : "bad" };
  const pct = Math.round(((cur - prev) / prev) * 100);
  if (pct === 0) return { text: "Same as the 7 days before", tone: "plain" };
  const up = pct > 0;
  const tone = upIsGood === null ? "plain" : up === upIsGood ? "good" : "bad";
  return { text: `${up ? "▲" : "▼"} ${Math.abs(pct)}% vs the 7 days before`, tone };
}

export function MoneyCardPending() {
  return (
    <section className="card money-card" aria-busy="true">
      <div className="money-head"><div className="label">Money · last 7 days</div></div>
      <p className="subtitle" style={{ margin: 0 }}>Loading spend and bookings. Not a result yet.</p>
    </section>
  );
}

export async function MoneyCard({ scope }: { scope: Scope }) {
  const { supabase } = scope;
  const { cur, prev } = periods();
  const curStart = `${cur.since}T00:00:00+05:30`;
  const prevStart = `${prev.since}T00:00:00+05:30`;

  // ── Tokens paid, any source. Two head counts. ──
  // RLS keeps a company admin in their company; companyId narrows a super
  // admin who picked one. Null = every company, super admin only.
  const countTokens = (from: string, to: string | null) => {
    let q = supabase.from("contacts").select("id", { count: "exact", head: true }).gte("token_paid_at", from);
    if (to) q = q.lt("token_paid_at", to);
    if (scope.companyId) q = q.eq("company_id", scope.companyId);
    return q;
  };
  const tokens = await Promise.all([countTokens(curStart, null), countTokens(prevStart, curStart)]);
  const tokensCur = tokens[0].error ? null : tokens[0].count ?? 0;
  const tokensPrev = tokens[1].error ? null : tokens[1].count ?? 0;

  // ── Ads. One central Meta account, so spend is the whole account. ──
  let adsWhy: string | null = null;
  let spendCur = 0, spendPrev: number | null = null, bookedCur = 0, bookedPrev: number | null = null;
  let currency = "";

  if (!scope.isSuper) {
    adsWhy = "Ads run from one central account. Spend is shown to the platform owner.";
  } else if (scope.companyId) {
    adsWhy = "Spend is for the whole central ad account and cannot be split by one company. Open Today without a company picked to see it.";
  } else if (!scope.homeCompanyId) {
    adsWhy = "Your account is not linked to a company, so the ad account cannot be found.";
  } else {
    const { data: integ, error: integErr } = await supabase.from("facebook_integrations")
      .select("ad_account_id, ads_token_secret_id")
      .eq("company_id", scope.homeCompanyId)
      .maybeSingle<{ ad_account_id: string | null; ads_token_secret_id: string | null }>();
    if (integErr) {
      adsWhy = `Could not read the ad account settings: ${integErr.message}`;
    } else if (!integ?.ad_account_id || !integ?.ads_token_secret_id) {
      adsWhy = "The Meta ad account is not connected yet. Connect it in Ads Manager.";
    } else {
      const ask = (time_range: Period) => supabase.functions.invoke<AdsAnswer>("ads-insights", {
        body: { company: scope.homeCompanyId, time_range },
      });
      const [a, b] = await Promise.all([ask(cur), ask(prev)]);
      if (a.error || !a.data?.ok) {
        adsWhy = `Meta did not answer: ${a.data?.error || a.error?.message || "unknown error"}`;
      } else {
        currency = a.data.currency ?? "";
        const rows = a.data.rows ?? [];
        spendCur = rows.reduce((t, r) => t + (Number(r.spend) || 0), 0);
        bookedCur = rows.reduce((t, r) => t + (Number(r.crm_booked) || 0), 0);
        if (!b.error && b.data?.ok) {
          const pr = b.data.rows ?? [];
          spendPrev = pr.reduce((t, r) => t + (Number(r.spend) || 0), 0);
          bookedPrev = pr.reduce((t, r) => t + (Number(r.crm_booked) || 0), 0);
        }
      }
    }
  }

  const cells: Cell[] = [];
  if (adsWhy) {
    cells.push({ key: "Ad spend (Meta)", value: DASH, delta: null, why: adsWhy });
    cells.push({ key: "Bookings from ads", value: DASH, delta: null, why: "Needs the ad spend above." });
    cells.push({ key: "Cost per booking", value: DASH, delta: null, why: "Needs the ad spend above." });
  } else {
    cells.push({ key: "Ad spend (Meta)", value: money(spendCur, currency), delta: change(spendCur, spendPrev, null) });
    cells.push({ key: "Bookings from ads", value: String(bookedCur), delta: change(bookedCur, bookedPrev, true) });
    if (bookedCur > 0) {
      const cpb = spendCur / bookedCur;
      const prevCpb = spendPrev !== null && bookedPrev ? spendPrev / bookedPrev : null;
      cells.push({
        key: "Cost per booking", value: money(cpb, currency),
        delta: prevCpb === null ? { text: "No bookings from ads the 7 days before", tone: "plain" } : change(cpb, prevCpb, false),
      });
    } else {
      cells.push({
        key: "Cost per booking", value: DASH, delta: null,
        why: spendCur > 0 ? `No booking from ads yet this week, after ${money(spendCur, currency)} spent.` : "No spend and no bookings this week.",
      });
    }
  }
  cells.push(tokensCur === null
    ? { key: "Tokens paid (all leads)", value: DASH, delta: null, why: "Could not read bookings." }
    : { key: "Tokens paid (all leads)", value: String(tokensCur), delta: change(tokensCur, tokensPrev, true) });

  const adsLink = scope.isSuper ? "/dashboard/ads" : null;

  return (
    <section className="card money-card" aria-label="Money, last 7 days">
      <div className="money-head">
        <div className="label">Money · last 7 days</div>
        {adsLink && <Link href={adsLink}>Open Ads Manager →</Link>}
      </div>
      <div className="money-grid">
        {cells.map((c) => (
          <div key={c.key} className="money-cell">
            <div className="k">{c.key}</div>
            <div className="v">{c.value}</div>
            {c.delta && <div className={`d ${c.delta.tone === "plain" ? "" : c.delta.tone}`}>{c.delta.text}</div>}
            {c.why && <div className="why">{c.why}</div>}
          </div>
        ))}
      </div>
      <p className="money-foot">
        Bookings from ads = leads from Meta ads that came in these 7 days and are Booked now. Tokens paid = any lead
        whose booking token was recorded in these 7 days.
      </p>
    </section>
  );
}
