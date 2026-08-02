// Two ways to reach a WhatsApp number, behind one interface.
//
// The point of the interface is that the thing sending a founder's daily report
// must not know which pipe carried it. Before this, pulse-broadcast held Meta's
// Graph URL, Meta's token lookup, Meta's 24-hour rule and Meta's template
// fallback inline — so "send the founder their report" and "talk to the Cloud
// API" were one lump of code, and a second pipe could only be added by forking
// it. Now the report asks for a provider and calls sendText().
//
// A deliberate asymmetry, and the most important line in this file: only
// FOUNDER NOTIFICATIONS may choose a provider. Customer-facing senders
// (whatsapp-send, the webhook replies) call Meta directly and never read the
// provider column. Baileys logs in as an ordinary WhatsApp account with no
// business agreement behind it; WhatsApp's terms do not allow it and accounts
// get banned. Losing an internal reporting number costs an evening. Losing the
// number leads reply to costs the business.
import { type SupabaseClient } from "jsr:@supabase/supabase-js@2";

const GRAPH = "https://graph.facebook.com/v21.0";

export type SendResult =
  | { ok: true; id: string | null }
  // retryable separates "the pipe is down, hold it and try again" from "this
  // will fail identically forever". Queueing a permanent failure just means
  // discovering it four times instead of once.
  | { ok: false; error: string; retryable: boolean };

export interface WhatsAppProvider {
  readonly name: "meta" | "baileys";
  /** Bring the transport up if it needs bringing up. Meta is stateless HTTP, so this is a no-op there. */
  connect(): Promise<void>;
  sendText(to: string, message: string): Promise<SendResult>;
  isConnected(): Promise<boolean>;
}

/**
 * Meta answers the 24-hour rule with a code and a paragraph of API English.
 * Turn it into the one sentence that says what to actually do — this is shown
 * to the person who set the number up, not to a developer.
 */
export function humanError(code: number | undefined, msg: string): string {
  if (code === 131047 || /re-engagement|24 hour|24-hour/i.test(msg)) {
    return "WhatsApp only allows a plain message within 24 hours of that person messaging your business number. " +
      "For a daily report you need an approved WhatsApp template, or switch this company to the Baileys provider. " +
      "Quick workaround: have them send any message to your WhatsApp business number, and today's report goes through.";
  }
  if (code === 131030 || /not in allowed list/i.test(msg)) {
    return "This number isn't on your WhatsApp app's allowed test-recipient list. Add it in Meta (API Setup → " +
      "recipient phone number), or take the app out of test mode.";
  }
  if (/token/i.test(msg) && /expire|invalid/i.test(msg)) {
    return "The WhatsApp access token has expired — reconnect WhatsApp in admin, then try again.";
  }
  return msg;
}

/** Meta Cloud API — the default, and the only thing customers are ever messaged on. */
export class MetaProvider implements WhatsAppProvider {
  readonly name = "meta" as const;
  constructor(
    private phoneNumberId: string,
    private token: string,
    /** True when this company is borrowing the platform's shared number. */
    readonly borrowed = false,
  ) {}

  connect(): Promise<void> {
    return Promise.resolve();
  }

  // Having credentials is the only "connected" this transport has. Meta will
  // still decide per message whether it may be delivered — which is why nothing
  // here treats a 200 as proof of arrival.
  isConnected(): Promise<boolean> {
    return Promise.resolve(!!this.phoneNumberId && !!this.token);
  }

  async sendText(to: string, message: string): Promise<SendResult> {
    const r = await fetch(`${GRAPH}/${this.phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { preview_url: false, body: message },
      }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      const code = d?.error?.code as number | undefined;
      // 131047 is the 24-hour window: retrying in ten minutes changes nothing,
      // only the founder sending a message does. 5xx and rate limits are worth
      // another go.
      const retryable = r.status >= 500 || r.status === 429;
      return { ok: false, error: humanError(code, d?.error?.message ?? "send failed"), retryable };
    }
    return { ok: true, id: d?.messages?.[0]?.id ?? null };
  }
}

/**
 * Baileys — a real WhatsApp account held open by our own worker.
 *
 * No 24-hour window and no templates, because it is an ordinary account talking
 * to an ordinary contact. Its weakness is the opposite of Meta's: the session
 * genuinely goes down (deploys, phone offline, WhatsApp logging it out), so
 * nearly every failure here IS worth retrying — which is what the outbox is for.
 */
export class BaileysProvider implements WhatsAppProvider {
  readonly name = "baileys" as const;
  constructor(private baseUrl: string, private secret: string) {}

  private url(path: string): string {
    return `${this.baseUrl.replace(/\/+$/, "")}${path}`;
  }

  private headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.secret}`, "Content-Type": "application/json" };
  }

  async connect(): Promise<void> {
    await fetch(this.url("/reconnect"), { method: "POST", headers: this.headers() }).catch(() => {});
  }

  async isConnected(): Promise<boolean> {
    try {
      const r = await fetch(this.url("/status"), { headers: this.headers() });
      if (!r.ok) return false;
      const d = await r.json();
      return d?.status === "connected";
    } catch {
      return false;
    }
  }

  /** The full status, for the admin page. */
  async status(): Promise<{ status: string; number: string | null; last_seen: string | null; error: string | null }> {
    const r = await fetch(this.url("/status"), { headers: this.headers() });
    if (!r.ok) {
      return {
        status: "disconnected",
        number: null,
        last_seen: null,
        error: r.status === 401
          ? "The worker rejected our secret. Re-enter it on this page."
          : `Worker answered ${r.status}. Check the URL and that the service is running.`,
      };
    }
    const d = await r.json();
    return { status: d?.status ?? "disconnected", number: d?.number ?? null, last_seen: d?.last_seen ?? null, error: d?.error ?? null };
  }

  async qr(): Promise<{ status: string; qr: string | null }> {
    const r = await fetch(this.url("/qr"), { headers: this.headers() });
    if (!r.ok) return { status: "disconnected", qr: null };
    const d = await r.json();
    return { status: d?.status ?? "disconnected", qr: d?.qr ?? null };
  }

  async sendText(to: string, message: string): Promise<SendResult> {
    let r: Response;
    try {
      r = await fetch(this.url("/send"), {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ to, text: message }),
      });
    } catch (e) {
      // The worker is unreachable — a deploy, a cold box, a wrong URL. Always
      // worth another attempt; the queue decides when to stop.
      return { ok: false, error: `Baileys worker unreachable: ${String(e)}`, retryable: true };
    }
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      // 503 is the worker saying "I am not logged in" — the single most common
      // failure and exactly the one worth holding the message for.
      const retryable = r.status === 503 || r.status >= 500;
      return { ok: false, error: d?.error ?? `worker answered ${r.status}`, retryable };
    }
    return { ok: true, id: d?.id ?? null };
  }
}

/**
 * Which pipe carries this company's founder notifications.
 *
 * Meta stays the fallback in every direction: a company that picked Baileys but
 * has not finished setting it up still gets its report, rather than discovering
 * the gap a week later when someone asks why the numbers stopped arriving.
 */
export async function resolveProvider(
  admin: SupabaseClient,
  companyId: string,
): Promise<WhatsAppProvider | { error: string }> {
  const { data: integ } = await admin.from("whatsapp_integrations")
    .select("provider, phone_number_id, active").eq("company_id", companyId).maybeSingle();

  if (integ?.provider === "baileys") {
    const { data: b } = await admin.from("whatsapp_baileys")
      .select("base_url").eq("company_id", companyId).maybeSingle();
    const { data: secret } = await admin.rpc("get_baileys_secret", { p_company: companyId });
    if (b?.base_url && secret) return new BaileysProvider(String(b.base_url), String(secret));
    // Deliberately falls through to Meta rather than failing: half-configured
    // should degrade, not go silent.
  }

  const meta = async (cid: string, borrowed: boolean) => {
    const { data: i } = await admin.from("whatsapp_integrations")
      .select("phone_number_id, active").eq("company_id", cid).maybeSingle();
    if (!i?.active || !i.phone_number_id) return null;
    const { data: t } = await admin.rpc("get_whatsapp_token", { p_company: cid });
    return t ? new MetaProvider(String(i.phone_number_id), String(t), borrowed) : null;
  };

  const own = await meta(companyId, false);
  if (own) return own;

  // The platform's shared number, the same way one central Facebook ad account
  // already runs ads for every company. Sharing the pipe is not sharing the
  // data — the report is still built from this company_id and nothing else.
  const { data: pw } = await admin.from("platform_whatsapp").select("company_id").maybeSingle();
  if (pw?.company_id) {
    const shared = await meta(String(pw.company_id), true);
    if (shared) return shared;
  }

  return {
    error: "No WhatsApp number can send this. Connect WhatsApp for this company, pick a platform sending " +
      "number (super admin), or switch this company to the Baileys provider and scan its QR.",
  };
}
