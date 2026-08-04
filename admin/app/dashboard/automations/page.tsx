/**
 * Automation Center — every automated message, and whether it is working.
 *
 * Built to answer seven questions without opening SQL or reading an edge
 * function: why didn't the founder receive it · which function sent it · was
 * Baileys used · did Meta send it · was it queued · was it delivered · which
 * template was used.
 *
 * Grouped by AUDIENCE rather than by function, because that is the decision
 * being protected. The founder should receive four things and nothing else;
 * the telecaller's coaching stays in the app so it does not compete with the
 * pushes, calls and customer chats already on their phone. Sorting by audience
 * makes an accidental fifth founder message obvious the moment it is added.
 *
 * The registry in ./registry.ts is the source of truth for what exists; this
 * page only adds live status to it. Where nothing is logged the row says so
 * outright — an automation with no record is more dangerous than one that has
 * failed, because failure at least leaves a mark.
 */
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AUDIENCE_LABEL, AUDIENCE_NOTE, AUTOMATIONS, type Audience } from "./registry";
import { TestSend } from "./TestSend";

export const dynamic = "force-dynamic";

function ist(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata", day: "numeric", month: "short",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
}

const AUDIENCE_EMOJI: Record<Audience, string> = {
  founder: "👑", telecaller: "👤", customer: "🧑‍💼",
};

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

  // Last send and last failure per automation kind, plus the queue depth and
  // the recipients a test can be aimed at.
  const waQ = supabase.from("whatsapp_messages")
    .select("kind, status, error, created_at, counterparty")
    .not("kind", "is", null)
    .order("created_at", { ascending: false }).limit(400);
  if (scope) waQ.eq("company_id", scope);

  const remQ = supabase.from("lead_activities")
    .select("created_at").eq("type", "reminder")
    .order("created_at", { ascending: false }).limit(1);
  if (scope) remQ.eq("company_id", scope);

  const outboxQ = supabase.from("notification_outbox")
    .select("id, kind, status, last_error, next_attempt_at")
    .eq("status", "queued").limit(50);
  if (scope) outboxQ.eq("company_id", scope);

  const subsQ = supabase.from("pulse_subscribers")
    .select("id, label, phone, salesperson_id, active, send_hour_ist, last_status, last_error, last_sent_at")
    .order("label");
  if (scope) subsQ.eq("company_id", scope);

  // Messages only started carrying a kind when this page was built, so "never
  // sent" needs a floor under it — otherwise a year-old working automation
  // reads as one that has never fired.
  const sinceQ = supabase.from("whatsapp_messages")
    .select("created_at").not("kind", "is", null)
    .order("created_at", { ascending: true }).limit(1);

  const [companyRows, wa, rem, outbox, subs, since] = await Promise.all([
    isSuper ? supabase.from("companies").select("id, name").order("name")
            : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    waQ, remQ, outboxQ, subsQ, sinceQ,
  ]);
  const trackingSince = (since.data?.[0] as { created_at?: string } | undefined)?.created_at ?? null;

  const companyList = (companyRows.data ?? []) as Array<{ id: string; name: string }>;
  const waRows = (wa.data ?? []) as Array<{
    kind: string; status: string | null; error: string | null;
    created_at: string; counterparty: string | null;
  }>;
  const subRows = (subs.data ?? []) as Array<{
    id: string; label: string; phone: string; salesperson_id: string | null;
    active: boolean; send_hour_ist: number; last_status: string | null;
    last_error: string | null; last_sent_at: string | null;
  }>;
  const queued = (outbox.data ?? []) as Array<{ id: string; kind: string | null; last_error: string | null }>;

  // Rows are newest-first, so the first match per kind is the latest.
  const lastOf = (k: string) => waRows.find((r) => r.kind === k) ?? null;
  const lastFailOf = (k: string) =>
    waRows.find((r) => r.kind === k && (r.status === "failed" || !!r.error)) ?? null;

  function status(a: (typeof AUTOMATIONS)[number]) {
    if (a.statusKind?.startsWith("wa:")) {
      const k = a.statusKind.slice(3);
      return { sent: lastOf(k)?.created_at ?? null, fail: lastFailOf(k), err: lastFailOf(k)?.error ?? null };
    }
    if (a.statusKind === "activity") {
      return { sent: (rem.data?.[0] as { created_at?: string } | undefined)?.created_at ?? null, fail: null, err: null };
    }
    return { sent: null, fail: null, err: null };
  }

  const q = scope ? `?company=${scope}` : "";
  const pulseSub = subRows.find((s) => !s.salesperson_id && s.active) ?? null;
  const repSub = subRows.find((s) => s.salesperson_id && s.active) ?? null;

  return (
    <>
      <h2>🎛 Automation Center</h2>
      <p className="subtitle">
        <strong>Every automated message, and whether it is working.</strong> Grouped by who
        receives it — so an accidental fifth message to the founder is obvious the moment somebody
        adds one. Each entry shows what fires it, which number carries it, the exact words, and
        when it last went out or last failed.
      </p>
      {trackingSince && (
        <p style={{ fontSize: 12, color: "var(--muted)", margin: "-4px 0 0" }}>
          Send history starts {ist(trackingSince)} — messages only began recording which
          automation produced them then. Anything older is real but untagged.
        </p>
      )}

      {isSuper && companyList.length > 0 && (
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center", margin: "12px 0 18px" }}>
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

      {/* The queue is the one number that explains a message that "didn't
          arrive" but was never actually lost. Only shown when it is non-zero,
          because a permanent "0 held" line is noise. */}
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
            <p className="subtitle" style={{ margin: "0 0 12px", fontSize: 12.5, maxWidth: "70ch" }}>
              {AUDIENCE_NOTE[aud]}
            </p>

            {rows.map((a) => {
              const st = status(a);
              const sub = a.id === "pulse-own" ? repSub : pulseSub;
              return (
                <details key={a.id} className="card"
                  style={{ padding: "12px 15px", marginBottom: 9 }}>
                  <summary style={{ cursor: "pointer", listStyle: "none", display: "flex",
                    justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 14.5, fontWeight: 650 }}>
                      {a.name}
                      <span style={{ fontSize: 11.5, fontWeight: 500, color: "var(--muted)", marginLeft: 9 }}>
                        {a.channel}
                      </span>
                    </span>
                    <span style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" }}>
                      {a.blind
                        ? <span style={{ color: "#fbbf24" }}>not logged</span>
                        : st.sent
                          ? <>last sent {ist(st.sent)}</>
                          : <span style={{ color: "var(--muted)" }}>never sent</span>}
                      {st.fail && <span style={{ color: "#f87171" }}> · last failed {ist(st.fail.created_at)}</span>}
                    </span>
                  </summary>

                  <div style={{ marginTop: 12, display: "grid", gap: 14,
                    gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))" }}>
                    <div>
                      <Field k="Trigger" v={a.trigger} />
                      <Field k="Sent by" v={<code>{a.sentBy}</code>} />
                      {a.sender && <Field k="Carried by" v={a.sender} />}
                      <Field k="Template" v={<code style={{ fontSize: 11.5 }}>{a.template}</code>} />
                      <Field k="Last sent" v={a.blind ? "not recorded anywhere" : ist(st.sent)} />
                      <Field k="Last failed" v={st.fail
                        ? `${ist(st.fail.created_at)} — ${st.err ?? "no reason recorded"}`
                        : a.blind ? "not recorded anywhere" : "none"} />
                      {a.livePreview && (
                        <div style={{ marginTop: 8 }}>
                          <Link href={a.livePreview.href} style={{ fontSize: 12.5 }}>
                            {a.livePreview.label} →
                          </Link>
                        </div>
                      )}
                    </div>

                    <div>
                      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em",
                        color: "var(--muted)", marginBottom: 5 }}>Preview</div>
                      <pre style={{
                        margin: 0, whiteSpace: "pre-wrap", fontSize: 12.5, lineHeight: 1.55,
                        background: "rgba(37,211,102,0.06)", border: "1px solid rgba(37,211,102,0.22)",
                        borderRadius: 10, padding: "11px 13px", fontFamily: "inherit",
                      }}>{a.preview}</pre>
                    </div>
                  </div>

                  {(a.blind || a.caveat) && (
                    <div style={{ marginTop: 12, fontSize: 12.5, color: "var(--muted)",
                      borderLeft: `3px solid ${a.blind ? "#fbbf24" : "rgba(255,255,255,0.18)"}`,
                      paddingLeft: 11 }}>
                      {a.blind ?? a.caveat}
                    </div>
                  )}

                  {a.test && (
                    <TestSend kind={a.test.kind} label={a.test.label} note={a.test.note}
                      subscriberId={a.test.kind === "pulse" ? sub?.id ?? null : null} />
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
          ? <div className="empty">Nobody is subscribed. The 7pm report goes to no one.</div>
          : subRows.map((s) => (
            <div key={s.id} style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center",
              padding: "9px 0", borderTop: "1px solid rgba(255,255,255,0.06)", fontSize: 13.5 }}>
              <strong>{s.salesperson_id ? "👤" : "👑"} {s.label}</strong>
              <span style={{ color: "var(--muted)" }}>{s.phone}</span>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>
                {s.salesperson_id ? "own report" : "whole team"} · {s.send_hour_ist}:00 IST
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

function Field({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 10, fontSize: 12.5, padding: "3px 0" }}>
      <span style={{ color: "var(--muted)", minWidth: 84, flexShrink: 0 }}>{k}</span>
      <span style={{ minWidth: 0, wordBreak: "break-word" }}>{v}</span>
    </div>
  );
}
