import { cache } from "react";
import { loadDashboardSession } from "@/lib/dashboard/scope";
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
/** Shown while the session read is in flight. Not green, not "all clear". */
export function CaptureOutagePending() {
  return (
    <a className="capture-notice is-pending" href="/dashboard/health#whatsapp-capture" role="status" aria-live="polite" aria-busy="true">
      <span className="capture-notice-dot" aria-hidden />
      <span className="capture-notice-text">
        <strong>Checking WhatsApp capture.</strong> Not a result yet. A quiet bar here does not mean capture is up.
      </span>
    </a>
  );
}

type Outage = { error: string | null; rows: DeadRow[]; total: number };

/** One read, shared by the one-line notice and the Health page in a request. */
const loadOutage = cache(async (): Promise<Outage> => {
  const { supabase } = await loadDashboardSession();
  const { data, error } = await supabase
    .from("wa_rep_sessions")
    .select("salesperson_id, company_id, status, last_seen_at, last_error")
    .returns<WaRepSession[]>();

  if (error) return { error: error.message, rows: [], total: 0 };

  const dead = (data ?? [])
    .map((row) => {
      const verdict = classifyCapture(row);
      return verdict ? { row, verdict } : null;
    })
    .filter((x): x is { row: WaRepSession; verdict: NonNullable<ReturnType<typeof classifyCapture>> } => x !== null);

  if (dead.length === 0) return { error: null, rows: [], total: (data ?? []).length };

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

  return { error: null, rows, total: (data ?? []).length };
});

/**
 * The shell notice: ONE line, on every admin page, linking to Health.
 *
 * It used to be a full-width red block that listed every dead session with
 * its clocks. The founder read it as the page being broken. The facts did not
 * go away — they moved to the top of Health, where there is room — but the
 * outage itself stays on every page, because silence must never look like
 * success.
 */
export async function CaptureOutageBanner() {
  const { error, rows } = await loadOutage();
  if (error) {
    return (
      <a className="capture-notice" href="/dashboard/health#whatsapp-capture" role="status">
        <span className="capture-notice-dot" aria-hidden />
        <span className="capture-notice-text">
          <strong>WhatsApp capture status could not be read.</strong> This is not saying capture is up.
        </span>
        <span className="capture-notice-go">Open Health →</span>
      </a>
    );
  }
  if (rows.length === 0) return null;
  const names = rows.map((r) => (r.companyName ? `${r.repName} (${r.companyName})` : r.repName));
  const shown = names.slice(0, 2).join(", ") + (names.length > 2 ? ` and ${names.length - 2} more` : "");
  return (
    <a className="capture-notice" href="/dashboard/health#whatsapp-capture" role="status" title={names.join("\n")}>
      <span className="capture-notice-dot" aria-hidden />
      <span className="capture-notice-text">
        <strong>WhatsApp capture is down</strong> for {shown}. Messages sent now are not recorded.
      </span>
      <span className="capture-notice-go">Fix in Health →</span>
    </a>
  );
}

/** The full detail, at the top of Health. Same read as the notice. */
export async function CaptureOutageDetails() {
  const { error, rows, total } = await loadOutage();
  if (error) {
    return (
      <BannerShell>
        <div className="capture-outage-row">
          <div className="capture-outage-copy">
            <strong>WhatsApp capture status could not be read</strong>
            <p>{error}. This page is not saying capture is up.</p>
          </div>
        </div>
      </BannerShell>
    );
  }
  if (rows.length === 0) {
    return (
      <p className="subtitle">
        {total === 0
          ? "No telecaller has linked WhatsApp yet, so no chats are being captured. Link one from WhatsApp."
          : `None of the ${total} linked WhatsApp sessions is down. Each is connected or reconnecting.`}
      </p>
    );
  }
  return <CaptureOutageBannerView rows={rows} />;
}

const NOT_RECORDED =
  "Messages sent while this is down are not recorded, and they cannot be fetched later. This is not the rep going quiet.";

export function CaptureOutageBannerView({ rows }: { rows: DeadRow[] }) {
  if (rows.length === 0) return null;
  const many = rows.length > 1;

  return (
    <BannerShell>
      {many && (
        <div className="capture-outage-copy">
          <strong>WhatsApp capture is down</strong>
          <p>
            {rows.length} capture sessions are disconnected, logged out, or the watchdog has marked them offline. {NOT_RECORDED}
          </p>
        </div>
      )}
      <ul>
        {rows.map((r) => {
          const href = `/dashboard/whatsapp?company=${encodeURIComponent(r.companyId)}#telecaller-whatsapp`;
          return (
            <li key={r.salespersonId} className="capture-outage-row">
              <div className="capture-outage-copy">
                {!many && <strong>WhatsApp capture is down</strong>}
                <p>
                  {sessionFacts(r)}
                  {!many && <> {NOT_RECORDED}</>}
                </p>
              </div>
              <a className="capture-outage-action" href={href}>
                Scan a new QR{r.companyName ? ` for ${r.companyName}` : ""}
              </a>
            </li>
          );
        })}
      </ul>
    </BannerShell>
  );
}

function sessionFacts(row: DeadRow): string {
  const who = row.companyName ? `${row.repName} (${row.companyName})` : row.repName;
  const status = reasonLabel(row.reason, row.status)
    + (row.reason === "logged_out" && row.status !== "logged_out" ? ` (status: ${row.status})` : "");
  return `${who} — ${status}. ${clockLines(row).join(" ")}`;
}

function clockLines(row: DeadRow): string[] {
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

  return lines;
}

function BannerShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="capture-outage" role="status">
      <div className="capture-outage-inner">{children}</div>
    </div>
  );
}
