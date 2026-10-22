"use client";

/**
 * Which number sends what — the first thing on the WhatsApp page.
 *
 * Two different numbers send WhatsApp from this CRM, and the page used to name
 * neither plainly. The founder looked at "ankit": the Cloud API card said
 * +1 555 648 3378, the Daily Pulse arrived from +91 70489 17300, and the page
 * opened with "All WhatsApp goes through one company number". All three were
 * on screen at once and no line said how they fit.
 *
 * How they fit:
 *   - Reports to the founder (Daily Pulse, alerts) leave through the founder
 *     pipe — a linked phone on the Baileys worker, the company's own or the
 *     platform's. The number is asked LIVE through notify-provider "route", the
 *     same ladder the sender climbs, never read from a cached row.
 *   - Messages to customers (team inbox replies) leave through Meta's Cloud
 *     API, from the display number below. A +1 555 number there is the test
 *     number Meta gives every new app: it can reach only the few phones added
 *     in Meta, never a real customer.
 */

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ist } from "@/lib/dashboard/format";

type Route = {
  provider: "baileys" | "meta"; via: string; lender: string | null;
  connected: boolean; number: string | null; last_seen: string | null; error: string | null;
};

type Row = {
  companyId: string;
  name: string;
  reports: { number: string | null; ok: boolean; how: string; problem: string | null } | null;
  customers: { number: string | null; test: boolean; set: boolean };
  lastReport: string | null;
  lastCustomer: string | null;
};

/** "917048917300" → "+91 70489 17300"; "+15556483378" → "+1 555 648 3378". */
export function prettyNumber(n: string | null | undefined): string | null {
  if (!n) return null;
  const d = n.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) return `+91 ${d.slice(2, 7)} ${d.slice(7)}`;
  if (d.length === 10) return `+91 ${d.slice(0, 5)} ${d.slice(5)}`;
  if (d.length === 11 && d.startsWith("1")) return `+1 ${d.slice(1, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
  return d ? `+${d}` : null;
}

/** Meta's test numbers are US +1 555 numbers. */
export function isMetaTestNumber(n: string | null | undefined): boolean {
  const d = (n ?? "").replace(/\D/g, "");
  return d.length === 11 && d.startsWith("1555");
}

async function loadRow(companyId: string, name: string): Promise<Row> {
  const supabase = createClient();
  const [route, integ, report, customer] = await Promise.all([
    supabase.functions.invoke<{ ok: boolean; route?: Route | null; reason?: string }>(
      "notify-provider", { body: { action: "route", company_id: companyId } },
    ),
    supabase.from("whatsapp_integrations").select("display_number, phone_number_id, active, access_token_secret_id")
      .eq("company_id", companyId).maybeSingle(),
    supabase.from("whatsapp_messages").select("created_at").eq("company_id", companyId).eq("direction", "out")
      .in("kind", ["pulse", "alert"]).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("whatsapp_messages").select("created_at").eq("company_id", companyId).eq("direction", "out")
      .is("kind", null).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const r = route.data?.route ?? null;
  let reports: Row["reports"] = null;
  if (route.error) {
    reports = { number: null, ok: false, how: "", problem: "Couldn't ask the sender. Refresh to try again." };
  } else if (!r) {
    reports = { number: null, ok: false, how: "", problem: route.data?.reason ?? "Nothing is set up to send reports." };
  } else if (r.provider === "baileys") {
    reports = {
      number: r.number,
      ok: r.connected,
      how: r.lender ? `Linked phone, shared from ${r.lender}` : "Linked phone",
      problem: r.connected ? null : (r.error ?? "The linked phone is logged out. Scan the QR below."),
    };
  } else {
    // Meta has no live session to ask, so the number is the integration's own.
    const lenderNo = r.lender ? null : integ.data?.display_number ?? null;
    reports = {
      number: lenderNo,
      ok: r.connected,
      how: r.lender ? `Meta, shared from ${r.lender}` : "Meta Cloud API",
      problem: r.connected ? null : (r.error ?? "Meta credentials are missing."),
    };
  }

  const i = integ.data;
  const set = !!(i?.active && i.phone_number_id && i.access_token_secret_id);
  return {
    companyId, name, reports,
    customers: { number: i?.display_number ?? null, test: isMetaTestNumber(i?.display_number), set },
    lastReport: report.data?.created_at ?? null,
    lastCustomer: customer.data?.created_at ?? null,
  };
}

const dot = (color: string) => <span aria-hidden style={{ color }}>●</span>;

function NumberLine({ label, sub, number, status, color, note }: {
  label: string; sub: string; number: string | null; status: string; color: string; note?: string | null;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(140px, 1fr) 2fr", gap: 12, padding: "12px 0", borderTop: "1px solid var(--border)" }}>
      <div>
        <div style={{ color: "var(--text)", fontSize: "var(--text-subheadline)", fontWeight: "var(--weight-semibold)" }}>{label}</div>
        <div style={{ color: "var(--muted)", fontSize: "var(--text-caption1)" }}>{sub}</div>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: "var(--text)", fontSize: "var(--text-title3)", fontWeight: "var(--weight-semibold)", fontVariantNumeric: "tabular-nums" }}>
          {number ?? "No number"}
        </div>
        <div style={{ fontSize: "var(--text-footnote)", color: "var(--muted)", marginTop: 2 }}>{dot(color)} {status}</div>
        {note && <div style={{ fontSize: "var(--text-footnote)", color, marginTop: 4, lineHeight: 1.45 }}>{note}</div>}
      </div>
    </div>
  );
}

function reportsLine(row: Row) {
  const r = row.reports;
  const last = row.lastReport ? `last sent ${ist(row.lastReport)}` : "nothing sent yet";
  if (!r) return { number: null, status: "Checking…", color: "var(--muted)", note: null };
  if (r.problem) return { number: prettyNumber(r.number), status: `${r.how ? `${r.how} · ` : ""}${last}`, color: "var(--bad)", note: r.problem };
  return { number: prettyNumber(r.number), status: `${r.how} · ${last}`, color: "var(--good)", note: null };
}

function customersLine(row: Row) {
  const c = row.customers;
  const last = row.lastCustomer ? `last sent ${ist(row.lastCustomer)}` : "nothing sent yet";
  if (!c.number && !c.set) {
    return {
      number: null, status: "Not set up", color: "var(--muted)",
      note: "The CRM can't WhatsApp customers yet. Reps message them from their own phones.",
    };
  }
  if (c.test) {
    return {
      number: prettyNumber(c.number), status: `Meta Cloud API · ${last}`, color: "var(--warn)",
      note: "This is Meta's free test number. It can only message the few phones added in Meta. Real customers never get these messages. To fix: add your real business number in Meta, then paste its Phone number ID in the setup below.",
    };
  }
  if (!c.set) {
    return {
      number: prettyNumber(c.number), status: "Meta Cloud API · not working", color: "var(--bad)",
      note: "The access token is missing or the number is switched off. Fix it in the setup below.",
    };
  }
  return { number: prettyNumber(c.number), status: `Meta Cloud API · ${last}`, color: "var(--good)", note: null };
}

export function SendingNumbers({ companyId, companyName, isSuper, companies }: {
  companyId: string; companyName: string | null; isSuper: boolean;
  companies: { id: string; name: string | null }[];
}) {
  const [row, setRow] = useState<Row | null>(null);
  const [all, setAll] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setRow(await loadRow(companyId, companyName ?? "This company"));
    setBusy(false);
  }, [companyId, companyName]);

  useEffect(() => { void load(); }, [load]);

  // The super admin owns every company, so every company's numbers are one tap
  // away — not hidden behind the picker one tenant at a time.
  const loadAll = useCallback(async () => {
    setAll(await Promise.all(companies.map((c) => loadRow(c.id, c.name ?? "Company"))));
  }, [companies]);

  const rep = row ? reportsLine(row) : null;
  const cus = row ? customersLine(row) : null;
  const twoNumbers = !!(rep?.number && cus?.number && rep.number !== cus.number);

  return (
    <div className="card" style={{ margin: "12px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <strong style={{ color: "var(--text)", fontSize: "var(--text-body)", fontWeight: "var(--weight-semibold)" }}>
          Which number sends what{companyName ? ` · ${companyName}` : ""}
        </strong>
        <button className="link" style={{ marginLeft: "auto" }} onClick={() => void load()} disabled={busy}>
          {busy ? "Checking…" : "Check again"}
        </button>
      </div>
      <p style={{ color: "var(--muted)", fontSize: "var(--text-footnote)", margin: "4px 0 4px" }}>
        Checked live just now, not from saved settings.
      </p>

      {rep && <NumberLine label="Reports to the founder" sub="Daily Pulse and alerts" {...rep} />}
      {cus && <NumberLine label="Messages to customers" sub="Replies typed in the team inbox" {...cus} />}
      {!row && <div style={{ color: "var(--muted)", fontSize: "var(--text-footnote)", padding: "12px 0" }}>Checking…</div>}

      {twoNumbers && (
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10, color: "var(--muted)", fontSize: "var(--text-footnote)", lineHeight: 1.5 }}>
          Two different numbers, on purpose. Reports go from a linked phone, so there is no 24-hour limit.
          Customers must be messaged from the official business number. A reply typed in the team inbox goes
          from {cus?.number}, not from {rep?.number}.
        </div>
      )}

      {isSuper && (
        <div style={{ borderTop: "1px solid var(--border)", marginTop: 10, paddingTop: 10 }}>
          {!all ? (
            <button className="link" onClick={() => void loadAll()}>Show all {companies.length} companies</button>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1.6fr 1.6fr", gap: 8, color: "var(--muted)", fontSize: "var(--text-caption1)" }}>
                <span>Company</span><span>Reports from</span><span>Customers from</span>
              </div>
              {all.map((r) => {
                const a = reportsLine(r); const b = customersLine(r);
                return (
                  <a key={r.companyId} href={`/dashboard/whatsapp?company=${r.companyId}`}
                    style={{ display: "grid", gridTemplateColumns: "1.2fr 1.6fr 1.6fr", gap: 8, fontSize: "var(--text-footnote)", color: "var(--text)", textDecoration: "none", padding: "4px 0", borderTop: "1px solid var(--border)" }}>
                    <span style={{ fontWeight: "var(--weight-semibold)" }}>{r.name}</span>
                    <span>{dot(a.color)} {a.number ?? (a.color === "var(--bad)" ? "Can't send" : "—")}</span>
                    <span>{dot(b.color)} {b.number ? `${b.number}${r.customers.test ? " (test)" : ""}` : "Not set up"}</span>
                  </a>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
