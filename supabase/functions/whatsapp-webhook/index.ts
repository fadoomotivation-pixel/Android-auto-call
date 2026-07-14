// WhatsApp Cloud API webhook. Meta calls this:
//  - GET  : one-time verification (echoes hub.challenge if the verify token matches).
//  - POST : inbound messages + delivery statuses. Each message is logged to
//           whatsapp_messages and routed to the rep who owns the matching lead.
//
// COEXISTENCE (business keeps using the WhatsApp Business app on the SAME
// number as the Cloud API) adds three event kinds we also handle:
//   • message_echoes    — a message the OWNER sent from their phone app → log
//                          it as an outbound so the CRM thread stays complete.
//   • history           — the one-time 6-month backfill of past chats when
//                          coexistence is first turned on.
//   • smb_app_state_sync — the app's contact list sync (recorded, not forced
//                          into leads, so it can't spam the pipeline).
//
// Public endpoint (Meta can't send a Supabase JWT) -> verify_jwt must be OFF.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function digits(s: string): string {
  return (s ?? "").replace(/\D/g, "");
}

/** Pull readable text out of any WhatsApp message shape. */
function msgText(m: Record<string, unknown>): string {
  const t = m as { text?: { body?: string }; button?: { text?: string }; interactive?: { list_reply?: { title?: string }; button_reply?: { title?: string } }; caption?: string };
  return t.text?.body ?? t.button?.text ?? t.interactive?.list_reply?.title
    ?? t.interactive?.button_reply?.title ?? t.caption ?? "";
}

/** Log one WhatsApp message idempotently (Meta retries + history re-syncs). */
async function logMessage(
  admin: SupabaseClient,
  companyId: string,
  defaultRep: string | null,
  direction: "in" | "out",
  counterparty: string,
  m: Record<string, unknown>,
) {
  const num = digits(counterparty);
  if (!num) return;
  const { data: match } = await admin.rpc("wa_match_contact", { p_company: companyId, p_number: num });
  const row = Array.isArray(match) ? match[0] : null;
  await admin.from("whatsapp_messages").upsert({
    company_id: companyId,
    contact_id: row?.contact_id ?? null,
    salesperson_id: row?.salesperson_id ?? defaultRep ?? null,
    direction,
    wa_message_id: (m.id as string) ?? null,
    counterparty: num,
    body: msgText(m),
    msg_type: (m.type as string) ?? "text",
  }, { onConflict: "wa_message_id", ignoreDuplicates: true });
}

Deno.serve(async (req) => {
  const admin = createClient(SUPABASE_URL, SERVICE);

  // --- Verification handshake ---
  if (req.method === "GET") {
    const p = new URL(req.url).searchParams;
    const mode = p.get("hub.mode");
    const token = p.get("hub.verify_token") ?? "";
    const challenge = p.get("hub.challenge") ?? "";
    if (mode === "subscribe" && token) {
      const { data } = await admin.from("whatsapp_integrations")
        .select("company_id").eq("verify_token", token).maybeSingle();
      if (data) return new Response(challenge, { status: 200 });
    }
    return new Response("forbidden", { status: 403 });
  }

  if (req.method !== "POST") return new Response("ok", { status: 200 });

  // --- Inbound events ---
  try {
    const body = await req.json();
    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const v = change.value ?? {};
        const phoneNumberId = v.metadata?.phone_number_id;
        if (!phoneNumberId) continue;
        const { data: integ } = await admin.from("whatsapp_integrations")
          .select("company_id, default_salesperson_id").eq("phone_number_id", phoneNumberId).maybeSingle();
        if (!integ) continue;
        const companyId = integ.company_id;
        const defaultRep = integ.default_salesperson_id ?? null;
        const selfNumber = digits(v.metadata?.display_phone_number ?? "");

        // Inbound customer messages.
        for (const m of v.messages ?? []) {
          await logMessage(admin, companyId, defaultRep, "in", m.from, m);
        }

        // COEXISTENCE — echoes of messages the owner sent from their PHONE app.
        // These are outbound; the counterparty is the recipient (`to`).
        for (const m of v.message_echoes ?? []) {
          await logMessage(admin, companyId, defaultRep, "out", m.to ?? m.recipient_id ?? "", m);
        }

        // COEXISTENCE — one-time history backfill (up to ~6 months) when the
        // number is first linked. Threads of past messages, either direction:
        // the party that ISN'T our own number is the counterparty.
        for (const h of v.history ?? []) {
          for (const thread of h.threads ?? []) {
            const other = digits(thread.id ?? thread.contact_id ?? "");
            for (const m of thread.messages ?? []) {
              const fromSelf = selfNumber && digits(m.from) === selfNumber;
              await logMessage(admin, companyId, defaultRep, fromSelf ? "out" : "in", other, m);
            }
          }
        }

        // COEXISTENCE — the business app's contact list. Recorded on the
        // integration for reference; deliberately NOT auto-turned into leads,
        // so a personal contact book can't flood the pipeline.
        if (v.smb_app_state_sync) {
          await admin.from("whatsapp_integrations")
            .update({ last_contacts_sync_at: new Date().toISOString() })
            .eq("phone_number_id", phoneNumberId);
        }

        // Delivery/read status updates for our outbound messages.
        for (const s of v.statuses ?? []) {
          if (!s.id) continue;
          await admin.from("whatsapp_messages")
            .update({ status: s.status }).eq("wa_message_id", s.id);
        }
      }
    }
  } catch (_) { /* never error back to Meta; just 200 */ }

  return new Response("ok", { status: 200 });
});
