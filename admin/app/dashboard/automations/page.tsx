/**
 * Automation Center — every automated message, and whether it is working.
 *
 * Built to replace opening SQL, edge functions and logs. When a founder asks
 * "why didn't I get the booking message?", the answer is on this page inside
 * thirty seconds: Automation Health says whether the cron ran, whether the
 * WhatsApp session is up and whether the queue is holding anything; the row
 * itself says when it last went out, when it last failed and with what reason;
 * and the path shows exactly where it stopped.
 *
 * Grouped by AUDIENCE rather than by function, because that is the decision
 * being protected. The founder receives four things — site visit fixed,
 * booking, payment, daily pulse — and a fifth is how the first four stop being
 * read. Sorting by audience makes an accidental fifth obvious the moment it is
 * added.
 *
 * The registry in ./registry.ts is the source of truth for what exists; this
 * page only adds live status to it. Where nothing is logged the row says so
 * outright — an automation with no record is more dangerous than one that has
 * failed, because failure at least leaves a mark.
 */
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  AUDIENCE_LABEL, AUDIENCE_NOTE, AUTOMATIONS, ROUTING, TRANSPORT, type Audience,
} from "./registry";
import { TestSend } from "./TestSend";
import { Health } from "./Health";

export const dynamic = "force-dynamic";

function ist(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata", day: "numeric", month: "short",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
}
function clock(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true,
  });
}

const AUDIENCE_EMOJI: Record<Audience, string> = {
  founder: "👑", telecaller: "👤", customer: "🧑‍💼",
};

type WaRow = {
  id: string; kind: string; status: string | null; error: string | null;
  created_at: string; counterparty: string | null;
};
type OutboxRow = {
  id: string; kind: string | null; status: string; attempts: number;
  created_at: string; sent_at: string | null; last_error: string | null; to_phone: string | null;
};

/** One delivery, and the stages of it that are actually recorded. */
type Stage = { label: string; at?: string | null; state: "done" | "fail" | "idle" };
type Event = { at: string; to: string | null; stages: Stage[]; error?: string | null };

export default async function AutomationsPage({
  searchParams,
}: { searchParams: Promise<{ company?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: me }, { data: pa }] = await Promise.all([
    supabase.from("profiles").select("role, company_id").eq("id", user!.id)
      .maybeSingle<{ role: string; company_id: string | null }>(),
    supabase.from("platform_admins").select("user_id").eq("user_id", user!.id).maybeSingle(),
  ]);
  const isSuper = !!pa;
  if (me?.role !== "admin" && !isSuper) redirect("/dashboard");

  const scope = isSuper ? (sp.company ?? null) : (me?.company_id ?? null);

  const waQ = supabase.from("whatsapp_messages")
    .select("id, kind, status, error, created_at, counterparty")
    .eq("direction", "out").not("kind", "is", null)
    .order("created_at", { ascending: false }).limit(400);
  if (scope) waQ.eq("company_id", scope);

  const remQ = supabase.from("lead_activities")
    .select("created_at").eq("type", "reminder")
    .order("created_at", { ascending: false }).limit(5);
  if (scope) remQ.eq("company_id", scope);

  // Every state, not just queued: a message that was held and then went is the
  // single most useful thing the timeline can show, and it is invisible if only
  // the current backlog is read.
  const outboxQ = supabase.from("notification_outbox")
    .select("id, kind, status, attempts, created_at, sent_at, last_error, to_phone")
    .order("created_at", { ascending: false }).limit(60);
  if (scope) outboxQ.eq("company_id", scope);

  const subsQ = supabase.from("pulse_subscribers")
    .select("id, label, phone, salesperson_id, active, alerts_on, send_hour_ist, last_status, last_error, last_sent_at")
    .order("label");
  if (scope) subsQ.eq("company_id", scope);

  const sinceQ = supabase.from("whatsapp_messages")
    .select("created_at").not("kind", "is", null)
    .order("created_at", { ascending: true }).limit(1);

  const [companyRows, wa, rem, outbox, subs, since] = await Promise.all([
    isSuper ? supabase.from("companies").select("id, name").order("name")
            : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    waQ, remQ, outboxQ, subsQ, sinceQ,
  ]);

  const companyList = (companyRows.data ?? []) as Array<{ id: string; name: string }>;
  const waRows = (wa.data ?? []) as WaRow[];
  const outRows = (outbox.data ?? []) as OutboxRow[];
  const subRows = (subs.data ?? []) as Array<{
    id: string; label: string; phone: string; salesperson_id: string | null;
    active: boolean; alerts_on: boolean | null; send_hour_ist: number; last_status: string | null;
    last_error: string | null; last_sent_at: string | null;
  }>;
  const remRows = (rem.data ?? []) as Array<{ created_at: string }>;
  const trackingSince = (since.data?.[0] as { created_at?: string } | undefined)?.created_at ?? null;
  const queued = outRows.filter((r) => r.status === "queued");

  const companyName = scope
    ? companyList.find((c) => c.id === scope)?.name ?? "This company"
    : "All companies";

  // Rows are newest-first, so the first match per kind is the latest.
  const lastOf = (k: string) => waRows.find((r) => r.kind === k) ?? null;
  const lastFailOf = (k: string) =>
    waRows.find((r) => r.kind === k && (r.status === "failed" || !!r.error)) ?? null;

  function status(a: (typeof AUTOMATIONS)[number]) {
    if (a.statusKind?.startsWith("wa:")) {
      const k = a.statusKind.slice(3);
      const fail = lastFailOf(k);
      return { sent: lastOf(k)?.created_at ?? null, fail, err: fail?.error ?? null };
    }
    if (a.statusKind === "activity") {
      return { sent: remRows[0]?.created_at ?? null, fail: null, err: null };
    }
    return { sent: null, fail: null as WaRow | null, err: null };
  }

  /**
   * The delivery timeline, built from the two tables that record one.
   *
   * A message that went straight out has a single moment — there is no
   * per-stage log to invent one from, and faking "Queued → Sending →
   * Delivered" timestamps for it would be a lie told in a debugging tool. A
   * message that was HELD genuinely has the stages, and those are the
   * interesting ones anyway.
   */
  function timeline(a: (typeof AUTOMATIONS)[number]): Event[] {
    if (!a.statusKind?.startsWith("wa:")) return [];
    const k = a.statusKind.slice(3);
    const events: Event[] = [];

    for (const o of outRows.filter((r) => r.kind === k)) {
      const stages: Stage[] = [{ label: "Queued", at: o.created_at, state: "done" }];
      stages.push({
        label: o.attempts > 1 ? `Sending · try ${o.attempts}` : "Sending",
        state: o.status === "failed" ? "fail" : o.status === "sent" ? "done" : "idle",
      });
      stages.push(o.status === "sent"
        ? { label: "Delivered", at: o.sent_at, state: "done" }
        : o.status === "failed"
          ? { label: "FAILED", state: "fail" }
          : { label: "Waiting to retry", state: "idle" });
      events.push({ at: o.created_at, to: o.to_phone, stages, error: o.last_error });
    }

    for (const m of waRows.filter((r) => r.kind === k)) {
      const failed = m.status === "failed" || !!m.error;
      events.push({
        at: m.created_at,
        to: m.counterparty,
        stages: [
          { label: "Sending", at: m.created_at, state: failed ? "fail" : "done" },
          failed
            ? { label: "FAILED", state: "fail" }
            : {
                // Baileys sends from a real account, so a send that returned
                // really went. Meta only accepted it — the verdict arrives
                // later by webhook, if it arrives at all.
                label: m.status === "accepted" ? "Accepted by Meta" : m.status === "delivered" ? "Delivered" : "Sent",
                state: "done",
              },
        ],
        error: m.error,
      });
    }

    return events.sort((x, y) => y.at.localeCompare(x.at)).slice(0, 4);
  }

  const q = scope ? `?company=${scope}` : "";
  const pulseSub = subRows.find((s) => !s.salesperson_id && s.active) ?? null;
  const repSub = subRows.find((s) => s.salesperson_id && s.active) ?? null;

  return (
    <>
      <h2>🎛 Automation Center</h2>
      <p className="subtitle">
        <strong>Every automated message, and whether it is working.</strong> Built so that
        &ldquo;why didn&rsquo;t I get the booking message?&rdquo; is answered here rather than in SQL:
        the health panel says whether the machinery ran, and each row says when it last went out,
        when it last failed, and exactly where it stopped.
      </p>
      {trackingSince && (
        <p style={{ fontSize: 12, color: "var(--muted)", margin: "-4px 0 0" }}>
          Send history starts {ist(trackingSince)} — messages only began recording which
          automation produced them then. Anything older is real but untagged.
        </p>
      )}

      {isSuper && companyList.length > 0 && (
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center", margin: "14px 0 18px" }}>
          <span style={{ fontSize: 11.5, color: "var(--muted)", marginRight: 2 }}>Showing:</span>
          {[{ id: null as string | null, name: "All companies" }, ...companyList].map((c) => {
            const on = scope === c.id;
            return (
              <Link key={c.id ?? "all"}
                href={c.id ? `/dashboard/automations?company=${c.id}` : "/dashboard/automations"}
                style={{
                  padding: on ? "6px 15px" : "5px 12px", borderRadius: 999, fontSize: 12.5,
                  textDecoration: "none", fontWeight: on ? 800 : 500,
                  background: on ? "var(--accent)" : "transparent",
                  color: on ? "#fff" : "var(--muted)",
                  border: on ? "1px solid var(--accent)" : "1px solid rgba(255,255,255,0.13)",
                }}>{on ? "✓ " : ""}{c.name}</Link>
            );
          })}
        </div>
      )}

      <Health companyId={scope} companyName={companyName} />

      {/* Which pipe carries what. Stated flatly and in one place, because the
          expensive mistake here is not a missed report — it is a customer
          message going out over the unofficial account and costing the number
          that leads reply to. */}
      <section className="card" style={{ padding: "13px 16px", marginBottom: 20 }}>
        <h3 style={{ margin: "0 0 3px", fontSize: 15.5 }}>🔀 Which number sends what</h3>
        <p style={{ margin: "0 0 9px", fontSize: 12, color: "var(--muted)" }}>
          No ambiguity, by design. Customer traffic never touches Baileys.
        </p>
        {ROUTING.map((r) => (
          <div key={r.what} style={{
            display: "grid", gridTemplateColumns: "minmax(150px,1fr) minmax(120px,150px) 2fr",
            gap: 10, alignItems: "baseline", padding: "7px 0", fontSize: 12.5,
            borderTop: "1px solid rgba(255,255,255,0.055)",
          }}>
            <strong style={{ fontWeight: 600 }}>{r.what}</strong>
            <span style={{ color: TRANSPORT[r.transport].colour, fontWeight: 650, whiteSpace: "nowrap" }}>
              → {TRANSPORT[r.transport].short}
            </span>
            <span style={{ color: "var(--muted)" }}>{r.why}</span>
          </div>
        ))}
      </section>

      {queued.length > 0 && (
        <div className="card" style={{ padding: "11px 15px", marginBottom: 16,
          border: "1px solid rgba(245,158,11,0.4)", background: "rgba(245,158,11,0.08)" }}>
          <strong style={{ fontSize: 13.5 }}>⏳ {queued.length} message{queued.length > 1 ? "s" : ""} held in the outbox</strong>
          <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 3 }}>
            WhatsApp was unreachable when these were sent. The drain cron retries every five
            minutes for about two hours, then gives up and records why.
            {queued[0]?.last_error ? ` Last reason: ${queued[0].last_error}` : ""}
          </div>
        </div>
      )}

      {(["founder", "telecaller", "customer"] as Audience[]).map((aud) => {
        const rows = AUTOMATIONS.filter((a) => a.audience === aud);
        return (
          <section key={aud} style={{ marginBottom: 26 }}>
            <h3 style={{ margin: "22px 0 2px", fontSize: 17 }}>
              {AUDIENCE_EMOJI[aud]} {AUDIENCE_LABEL[aud]}
              <span style={{ fontSize: 13, color: "var(--muted)", fontWeight: 400 }}> · {rows.length}</span>
            </h3>
            <p className="subtitle" style={{ margin: "0 0 12px", fontSize: 12.5, maxWidth: "72ch" }}>
              {AUDIENCE_NOTE[aud]}
            </p>

            {rows.map((a) => {
              const st = status(a);
              const events = timeline(a);
              const sub = a.id === "pulse-own" ? repSub : pulseSub;
              const t = TRANSPORT[a.transport];

              // The one-line verdict in the summary. "not logged" is a state of
              // its own and must never be dressed up as "never sent" — one
              // means nothing happened, the other means nobody would know.
              const current = a.blind
                ? { text: "not logged", colour: "#fbbf24" }
                : st.fail && (!st.sent || st.fail.created_at >= st.sent)
                  ? { text: `failing since ${ist(st.fail.created_at)}`, colour: "#f87171" }
                  : st.sent
                    ? { text: `last sent ${ist(st.sent)}`, colour: "var(--muted)" }
                    : { text: "never sent", colour: "var(--muted)" };

              return (
                <details key={a.id} className="card" style={{ padding: "12px 15px", marginBottom: 9 }}>
                  <summary style={{ cursor: "pointer", listStyle: "none", display: "flex",
                    justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 14.5, fontWeight: 650 }}>
                      {a.name}
                      <span style={{
                        fontSize: 11, fontWeight: 650, color: t.colour, marginLeft: 9,
                        border: `1px solid ${t.colour}55`, borderRadius: 999, padding: "1px 8px",
                      }}>{t.short}</span>
                    </span>
                    <span style={{ fontSize: 12, color: current.colour, whiteSpace: "nowrap" }}>
                      {current.text}
                    </span>
                  </summary>

                  {/* The path, exactly as asked for: where it starts, every hop,
                      and how it ended last time. */}
                  <div style={{
                    marginTop: 12, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6,
                    fontSize: 12, padding: "9px 11px", borderRadius: 9,
                    background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)",
                  }}>
                    {a.path.map((step, i) => (
                      <span key={step} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        {i > 0 && <span style={{ color: "var(--muted)" }}>↓</span>}
                        <code style={{ fontSize: 11.5 }}>{step}</code>
                      </span>
                    ))}
                    <span style={{ color: "var(--muted)" }}>↓</span>
                    <strong style={{
                      fontSize: 11.5,
                      color: a.blind ? "#fbbf24" : current.colour === "#f87171" ? "#f87171" : "#86efac",
                    }}>
                      {a.blind ? "NOT RECORDED" : current.colour === "#f87171" ? "FAILED" : st.sent ? "Delivered" : "Nothing yet"}
                    </strong>
                    {st.err && (
                      <span style={{ fontSize: 11.5, color: "#fca5a5", flexBasis: "100%" }}>
                        Reason: {st.err}
                      </span>
                    )}
                  </div>

                  <div style={{ marginTop: 13, display: "grid", gap: 15,
                    gridTemplateColumns: "repeat(auto-fit,minmax(290px,1fr))" }}>
                    <div>
                      <Field k="Trigger" v={a.trigger} />
                      <Field k="Recipient" v={a.recipient} />
                      <Field k="Sender" v={t.label} />
                      <Field k="Function" v={<code>{a.sentBy}</code>} />
                      <Field k="Template" v={<code style={{ fontSize: 11.5 }}>{a.template}</code>} />
                      <Field k="Last sent" v={a.blind ? "not recorded anywhere" : ist(st.sent)} />
                      <Field k="Last failed" v={st.fail
                        ? `${ist(st.fail.created_at)} — ${st.err ?? "no reason recorded"}`
                        : a.blind ? "not recorded anywhere" : "none"} />
                      <Field k="Status" v={<span style={{ color: current.colour }}>{current.text}</span>} />
                      {a.livePreview && (
                        <div style={{ marginTop: 8 }}>
                          <Link href={a.livePreview.href} style={{ fontSize: 12.5 }}>
                            {a.livePreview.label} →
                          </Link>
                        </div>
                      )}
                    </div>

                    <div>
                      <Label>Preview</Label>
                      <pre style={{
                        margin: 0, whiteSpace: "pre-wrap", fontSize: 12.5, lineHeight: 1.55,
                        background: "rgba(37,211,102,0.06)", border: "1px solid rgba(37,211,102,0.22)",
                        borderRadius: 10, padding: "11px 13px", fontFamily: "inherit",
                      }}>{a.preview}</pre>
                    </div>
                  </div>

                  {events.length > 0 && (
                    <div style={{ marginTop: 14 }}>
                      <Label>Delivery timeline · last {events.length}</Label>
                      {events.map((e, i) => (
                        <div key={`${e.at}-${i}`} style={{
                          display: "flex", flexWrap: "wrap", alignItems: "center", gap: 7,
                          padding: "6px 0", fontSize: 12,
                          borderTop: i ? "1px solid rgba(255,255,255,0.05)" : "none",
                        }}>
                          <span style={{ color: "var(--muted)", minWidth: 96 }}>{ist(e.at)}</span>
                          {e.stages.map((s, j) => (
                            <span key={s.label} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                              {j > 0 && <span style={{ color: "var(--muted)" }}>→</span>}
                              <span style={{
                                color: s.state === "fail" ? "#f87171" : s.state === "done" ? "#86efac" : "var(--muted)",
                                fontWeight: s.state === "fail" ? 700 : 500,
                              }}>
                                {s.label}{s.at ? ` ${clock(s.at)}` : ""}
                              </span>
                            </span>
                          ))}
                          {e.to && <span style={{ color: "var(--muted)", fontSize: 11.5 }}>· {e.to}</span>}
                          {e.error && <span style={{ color: "#fca5a5", flexBasis: "100%", fontSize: 11.5 }}>{e.error}</span>}
                        </div>
                      ))}
                      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 5 }}>
                        A message that went straight out has one moment, not three — only messages the
                        outbox had to hold record a Queued and a retry.
                      </div>
                    </div>
                  )}

                  {(a.blind || a.caveat) && (
                    <div style={{ marginTop: 13, fontSize: 12.5, color: "var(--muted)",
                      borderLeft: `3px solid ${a.blind ? "#fbbf24" : "rgba(255,255,255,0.18)"}`,
                      paddingLeft: 11 }}>
                      {a.blind ?? a.caveat}
                    </div>
                  )}

                  {a.test
                    ? <TestSend
                        preview={a.test.preview} send={a.test.send} note={a.test.note}
                        subscriberId={sub?.id ?? null} companyId={scope}
                        alertKind={a.id === "alert-site-visit-fixed" ? "site_visit_fixed" : undefined}
                      />
                    : (
                      <div style={{ marginTop: 13, fontSize: 12, color: "var(--muted)",
                        borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 11 }}>
                        No test button on purpose. Firing this would push a real notification to a
                        real person — that is not a test, it is the thing happening.
                      </div>
                    )}
                </details>
              );
            })}
          </section>
        );
      })}

      {/* Recipients live on Daily Pulse; repeating the editor here would be a
          second place to change a phone number. This is the read-only truth of
          who is currently subscribed. */}
      <section style={{ marginTop: 28 }}>
        <h3 style={{ fontSize: 17 }}>📇 Who is subscribed right now</h3>
        <p className="subtitle" style={{ margin: "0 0 10px", fontSize: 12.5 }}>
          Managed on <Link href={`/dashboard/pulse${q}`}>Daily Pulse</Link> — shown here so the
          delivery state and the recipient list can be read together.
        </p>
        {subRows.length === 0
          ? <div className="empty">Nobody is subscribed. The reports and alerts go to no one.</div>
          : subRows.map((s) => (
            <div key={s.id} style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center",
              padding: "9px 0", borderTop: "1px solid rgba(255,255,255,0.06)", fontSize: 13.5 }}>
              <strong>{s.salesperson_id ? "👤" : "👑"} {s.label}</strong>
              <span style={{ color: "var(--muted)" }}>{s.phone}</span>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>
                {s.salesperson_id ? "own report" : "whole team"} · {s.send_hour_ist}:00 IST
                {!s.salesperson_id && (s.alerts_on ? " · alerts on" : " · alerts off")}
              </span>
              <span style={{ fontSize: 12, marginLeft: "auto",
                color: !s.active ? "var(--muted)"
                  : s.last_status === "failed" ? "#f87171"
                  : s.last_status ? "#86efac" : "var(--muted)" }}>
                {!s.active ? "off"
                  : s.last_status === "failed" ? `failed — ${s.last_error ?? "no reason"}`
                  : s.last_sent_at ? `sent ${ist(s.last_sent_at)}` : "never sent"}
              </span>
            </div>
          ))}
      </section>
    </>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em",
      color: "var(--muted)", marginBottom: 5 }}>{children}</div>
  );
}

function Field({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 10, fontSize: 12.5, padding: "3px 0" }}>
      <span style={{ color: "var(--muted)", minWidth: 84, flexShrink: 0 }}>{k}</span>
      <span style={{ minWidth: 0, wordBreak: "break-word" }}>{v}</span>
    </div>
  );
}
