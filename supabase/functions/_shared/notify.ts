// Sending a founder a notification, without knowing how it gets there.
//
// Everything provider-specific lives in wa-provider.ts. This file only knows
// four things: who to tell, what to say, that a message too long for WhatsApp
// has to be split, and that a pipe which is merely DOWN must not lose the
// message. Add a third transport tomorrow and nothing here changes.
//
// The queue is the part worth arguing for. Baileys disconnects for entirely
// ordinary reasons — the container redeployed, the phone lost data, WhatsApp
// ended the session — and every one of those is a few minutes long. Without an
// outbox, a redeploy at 9:59pm silently costs the founder that night's report,
// and nobody finds out until they notice a gap days later. With one, the report
// lands late instead of never, and if it truly cannot be delivered the reason is
// written down next to the recipient it failed for.
import { type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { resolveProvider, type SendResult, type WhatsAppProvider } from "./wa-provider.ts";

/** WhatsApp rejects anything over 4096 characters. */
const LIMIT = 3500;

/** Split on rep boundaries so a telecaller's day is never cut in half. */
export function splitForWhatsApp(text: string, limit = LIMIT): string[] {
  if (text.length <= limit) return [text];
  const blocks = text.split("\n━━━━━━━━━━━━━━━\n");
  const out: string[] = [];
  let cur = "";
  for (const b of blocks) {
    const piece = cur ? `${cur}\n━━━━━━━━━━━━━━━\n${b}` : b;
    if (piece.length > limit && cur) { out.push(cur); cur = b; } else { cur = piece; }
  }
  if (cur) out.push(cur);
  return out.flatMap((s) => s.length <= limit ? [s] : (s.match(new RegExp(`[\\s\\S]{1,${limit}}`, "g")) ?? [s]));
}

export type NotifyResult = {
  ok: boolean;
  via?: "meta" | "baileys";
  parts?: number;
  wamid?: string | null;
  /** True when the pipe was down and the message is being held for retry. */
  queued?: boolean;
  borrowed_number?: boolean;
  error?: string;
};

export type NotifyRequest = {
  companyId: string;
  /** Digits with country code, no '+'. */
  to: string;
  body: string;
  kind?: string;
  /** Set for a daily pulse, so a later retry can update the founder's row. */
  subscriberId?: string | null;
};

/**
 * Logged into whatsapp_messages like every other outbound, so the super admin
 * sees the founder's digest in the same place as the reps' messages instead of
 * having to know a second table exists. salesperson_id stays null: nobody sent
 * this, the schedule did.
 *
 * "accepted" is Meta's own word for what a 200 means — it has taken the message
 * and issued an id; whether it hands it over is decided later and announced only
 * in a status webhook. Writing "sent" here is what once let a founder see a
 * green tick for a report that never arrived.
 */
async function logMessage(
  admin: SupabaseClient, req: NotifyRequest, waId: string | null, body: string, provider: string,
) {
  await admin.from("whatsapp_messages").insert({
    company_id: req.companyId,
    direction: "out",
    wa_message_id: waId,
    counterparty: req.to,
    body,
    msg_type: "text",
    // Baileys sends from a real logged-in account, so a delivered message really
    // is delivered — there is no webhook coming to upgrade it later, and calling
    // it "accepted" would leave it looking permanently unconfirmed.
    status: provider === "baileys" ? "sent" : "accepted",
  });
}

async function enqueue(admin: SupabaseClient, req: NotifyRequest, body: string, error: string) {
  await admin.from("notification_outbox").insert({
    company_id: req.companyId,
    to_phone: req.to,
    body,
    kind: req.kind ?? "pulse",
    subscriber_id: req.subscriberId ?? null,
    last_error: error,
    // A minute out. drainOutbox backs off from there.
    next_attempt_at: new Date(Date.now() + 60_000).toISOString(),
  });
}

/** One notification, whichever pipe this company is on. */
export async function notifyFounder(admin: SupabaseClient, req: NotifyRequest): Promise<NotifyResult> {
  const provider = await resolveProvider(admin, req.companyId);
  if ("error" in provider) return { ok: false, error: provider.error };
  return await sendVia(admin, provider, req);
}

async function sendVia(
  admin: SupabaseClient, provider: WhatsAppProvider, req: NotifyRequest,
): Promise<NotifyResult> {
  const parts = splitForWhatsApp(req.body);
  let firstId: string | null = null;
  let sentBody = "";

  for (const [i, part] of parts.entries()) {
    const tagged = parts.length > 1 ? `${part}\n\n(${i + 1}/${parts.length})` : part;
    const res: SendResult = await provider.sendText(req.to, tagged);

    if (!res.ok) {
      if (res.retryable) {
        // Hold only what has NOT gone yet. Re-queuing the whole report would
        // send the founder the first half twice.
        const remaining = parts.slice(i).join("\n");
        await enqueue(admin, req, remaining, res.error);
        return { ok: true, via: provider.name, parts: i, queued: true, wamid: firstId, error: res.error };
      }
      return { ok: false, via: provider.name, error: res.error };
    }

    firstId ??= res.id;
    sentBody = sentBody ? `${sentBody}\n${part}` : part;
  }

  await logMessage(admin, req, firstId, sentBody, provider.name);
  const borrowed = provider.name === "meta" && (provider as { borrowed?: boolean }).borrowed === true;
  return { ok: true, via: provider.name, parts: parts.length, wamid: firstId, borrowed_number: borrowed };
}

/**
 * Work the queue. Called by cron.
 *
 * Six attempts over roughly two hours, then stop. A report has a shelf life —
 * yesterday's numbers arriving on Thursday are noise — so failing loudly and
 * leaving the reason behind beats retrying into next week.
 */
export async function drainOutbox(admin: SupabaseClient, limit = 25): Promise<{ sent: number; failed: number; held: number }> {
  const MAX_ATTEMPTS = 6;
  const { data: due } = await admin.from("notification_outbox")
    .select("id, company_id, to_phone, body, kind, subscriber_id, attempts")
    .eq("status", "queued")
    .lte("next_attempt_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(limit);

  let sent = 0, failed = 0, held = 0;

  for (const row of due ?? []) {
    const attempts = (row.attempts as number) + 1;
    const provider = await resolveProvider(admin, row.company_id as string);

    const fail = async (error: string, retryable: boolean) => {
      const giveUp = !retryable || attempts >= MAX_ATTEMPTS;
      if (giveUp) failed++; else held++;
      await admin.from("notification_outbox").update({
        attempts,
        status: giveUp ? "failed" : "queued",
        last_error: error,
        // 2, 4, 8, 16, 32 minutes.
        next_attempt_at: new Date(Date.now() + Math.pow(2, attempts) * 60_000).toISOString(),
      }).eq("id", row.id as string);

      if (giveUp && row.subscriber_id) {
        await admin.from("pulse_subscribers")
          .update({ last_status: "failed", last_error: error }).eq("id", row.subscriber_id as string);
      }
    };

    if ("error" in provider) { await fail(provider.error, false); continue; }

    const res = await provider.sendText(row.to_phone as string, String(row.body));
    if (!res.ok) { await fail(res.error, res.retryable); continue; }

    sent++;
    await admin.from("notification_outbox")
      .update({ status: "sent", attempts, sent_at: new Date().toISOString(), last_error: null })
      .eq("id", row.id as string);
    await logMessage(
      admin,
      { companyId: row.company_id as string, to: row.to_phone as string, body: String(row.body) },
      res.id, String(row.body), provider.name,
    );
    if (row.subscriber_id) {
      await admin.from("pulse_subscribers").update({
        last_status: provider.name === "baileys" ? "sent" : "accepted",
        last_error: null,
        last_wa_message_id: res.id,
        last_sent_at: new Date().toISOString(),
      }).eq("id", row.subscriber_id as string);
    }
  }

  return { sent, failed, held };
}
