// WhatsApp Cloud API webhook. Meta calls this:
//  - GET  : one-time verification (echoes hub.challenge if the verify token matches).
//  - POST : inbound messages + delivery statuses. Each message is logged to
//           whatsapp_messages and routed to the rep who owns the matching lead.
// Public endpoint (Meta can't send a Supabase JWT) -> verify_jwt must be OFF.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function digits(s: string): string {
  return (s ?? "").replace(/\D/g, "");
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

        // Inbound customer messages.
        for (const m of v.messages ?? []) {
          const from = digits(m.from);
          const text = m.text?.body ?? m.button?.text ?? m.interactive?.list_reply?.title ?? "";
          const { data: match } = await admin.rpc("wa_match_contact", { p_company: companyId, p_number: from });
          const row = Array.isArray(match) ? match[0] : null;
          // Idempotent: Meta retries deliveries. Unique index on wa_message_id +
          // ignoreDuplicates means a retry is a no-op instead of a duplicate row.
          await admin.from("whatsapp_messages").upsert({
            company_id: companyId,
            contact_id: row?.contact_id ?? null,
            salesperson_id: row?.salesperson_id ?? integ.default_salesperson_id ?? null,
            direction: "in",
            wa_message_id: m.id ?? null,
            counterparty: from,
            body: text,
            msg_type: m.type ?? "text",
          }, { onConflict: "wa_message_id", ignoreDuplicates: true });
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
