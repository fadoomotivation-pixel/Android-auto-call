import { createClient } from "@/lib/supabase/server";
import { ago, ist } from "@/lib/dashboard/format";
import { classifyCapture, outageSince, reasonLabel, type CaptureReason } from "@/lib/capture-health";
import type { WaRepSession } from "@/lib/types";

export interface DeadRow {
  salespersonId: string;
  companyId: string;
  repName: string;
  companyName: string | null;
  reason: CaptureReason;
  status: string;
  lastSeenAt: string | null;
  lastMessageAt: string | null;
  /** Failed means we must not pretend there is no message. */
  messageLookup: "ok" | "failed";
}

/**
 * Persistent outage strip for the admin dashboard.
 *
 * One query of wa_rep_sessions, then — only for rows that are already dead —
 * the rep's name and the newest captured message. No company filter: RLS
 * keeps a company admin inside their tenant, and a super admin must see
 * every tenant. Filtering on profiles.company_id would pin that view to the
 * HQ company and hide the outage this banner exists for.
 *
 * link_ok_at is not selected. On 4 Oct 2026 it was minutes old while the
 * only session had been logged out since 26 Sep.
 */
export async function CaptureOutageBanner() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("wa_rep_sessions")
    .select("salesperson_id, company_id, status, last_seen_at, last_error")
    .returns<WaRepSession[]>();

  if (error) {
    return (
      <BannerShell>
        <strong>WhatsApp capture status could not be read</strong>
        <p>
          {error.message}. This page is not saying capture is up.
        </p>
      </BannerShell>
    );
  }

  const dead = (data ?? [])
    .map((row) => {
      const verdict = classifyCapture(row);
      return verdict ? { row, verdict } : null;
    })
    .filter((x): x is { row: WaRepSession; verdict: NonNullable<ReturnType<typeof classifyCapture>> } => x !== null);

  if (dead.length === 0) return null;

  const repIds = dead.map((d) => d.row.salesperson_id);
  const companyIds = [...new Set(dead.map((d) => d.row.company_id))];

  const [{ data: people }, { data: companies }, messages] = await Promise.all([
    supabase.from("profiles").select("id, full_name").in("id", repIds)
      .returns<{ id: string; full_name: string | null }[]>(),
    supabase.from("companies").select("id, name").in("id", companyIds)
      .returns<{ id: string; name: string | null }[]>(),
    Promise.all(dead.map(async (d) => {
      const { data: msg, error: msgErr } = await supabase
        .from("wa_observed_messages")
        .select("sent_at")
        .eq("company_id", d.row.company_id)
        .eq("salesperson_id", d.row.salesperson_id)
        .order("sent_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ sent_at: string }>();
      return {
        id: d.row.salesperson_id,
        at: msgErr ? null : (msg?.sent_at ?? null),
        failed: !!msgErr,
      };
    })),
  ]);

  const nameOf = new Map((people ?? []).map((p) => [p.id, p.full_name?.trim() || null]));
  const companyOf = new Map((companies ?? []).map((c) => [c.id, c.name?.trim() || null]));
  const messageOf = new Map(messages.map((m) => [m.id, m]));

  const rows: DeadRow[] = dead.map(({ row, verdict }) => {
    const msg = messageOf.get(row.salesperson_id);
    return {
      salespersonId: row.salesperson_id,
      companyId: row.company_id,
      repName: nameOf.get(row.salesperson_id) || "A telecaller",
      companyName: companyOf.get(row.company_id) ?? null,
      reason: verdict.reason,
      status: verdict.status,
      lastSeenAt: verdict.lastSeenAt,
      lastMessageAt: msg?.failed ? null : (msg?.at ?? null),
      messageLookup: msg?.failed ? "failed" : "ok",
    };
  });

  rows.sort((a, b) => {
    const ta = outageSince(a.lastSeenAt, a.lastMessageAt);
    const tb = outageSince(b.lastSeenAt, b.lastMessageAt);
    if (ta && tb) return new Date(ta).getTime() - new Date(tb).getTime();
    if (ta) return -1;
    if (tb) return 1;
    return a.repName.localeCompare(b.repName);
  });

  return <CaptureOutageBannerView rows={rows} />;
}

export function CaptureOutageBannerView({ rows }: { rows: DeadRow[] }) {
  if (rows.length === 0) return null;
  return (
    <BannerShell>
      <strong>WhatsApp capture is down</strong>
      <p>
        {rows.length === 1
          ? "A rep's capture session is disconnected, logged out, or the watchdog has marked it offline."
          : `${rows.length} capture sessions are disconnected, logged out, or the watchdog has marked them offline.`}
        {" "}Messages sent while this is down are not recorded, and they cannot be
        fetched later. This is not the rep going quiet.
      </p>
      <ul>
        {rows.map((r) => {
          const who = r.companyName ? `${r.repName} (${r.companyName})` : r.repName;
          const href = `/dashboard/whatsapp?company=${encodeURIComponent(r.companyId)}#telecaller-whatsapp`;
          return (
            <li key={r.salespersonId}>
              <div>
                <b>{who}</b>
                {" — "}
                {reasonLabel(r.reason, r.status)}
                {r.reason === "logged_out" && r.status !== "logged_out" ? ` (status: ${r.status})` : ""}.
              </div>
              <OutageClock row={r} />
              <a href={href}>Scan a new QR{r.companyName ? ` for ${r.companyName}` : ""}</a>
            </li>
          );
        })}
      </ul>
    </BannerShell>
  );
}

function OutageClock({ row }: { row: DeadRow }) {
  const message = row.messageLookup === "ok" ? row.lastMessageAt : null;
  const seen = row.lastSeenAt;
  const lines: string[] = [];

  if (!message && !seen) {
    lines.push(row.messageLookup === "failed"
      ? "The newest captured message could not be read, and the session has no last-received time, so how long this has been down is unknown."
      : "No captured message is stored, and the session has no last-received time, so how long this has been down is unknown.");
  } else {
    if (row.messageLookup === "failed") {
      lines.push("The newest captured message could not be read.");
    } else if (message) {
      lines.push(`Last message captured ${ago(message)} (${ist(message)}).`);
    } else {
      lines.push("No captured message is stored for this rep.");
    }
    if (seen && (!message || new Date(seen).getTime() !== new Date(message).getTime())) {
      lines.push(`Session last received data ${ago(seen)} (${ist(seen)}).`);
    }
  }

  return (
    <>
      {lines.map((line) => (
        <div key={line}>{line}</div>
      ))}
    </>
  );
}

function BannerShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="capture-outage" role="status">
      {children}
    </div>
  );
}
