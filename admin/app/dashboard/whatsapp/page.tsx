import { resolveScope } from "@/lib/dashboard/scope";
import { WhatsAppSetup } from "./WhatsAppSetup";
import { CompanyPicker } from "./CompanyPicker";
import { WhatsAppHealth } from "./WhatsAppHealth";
import { WhatsAppInbox } from "./WhatsAppInbox";
import { PlatformSender } from "./PlatformSender";
import { ProviderPicker } from "./ProviderPicker";
import { TelecallerWhatsApp } from "./TelecallerWhatsApp";

const WEBHOOK_URL = "https://rqgkzamuohdvttnkluzn.supabase.co/functions/v1/whatsapp-webhook";

/**
 * A labeled break between what a super admin checks every day and what gets
 * set up once and left alone. Before this the page was one flat stack of six
 * cards in setup order — Health, Setup, Provider, then the two things anyone
 * actually opens this page for (watchers, inbox) buried at the bottom. Same
 * components, same data; grouped so the daily half comes first.
 */
function Section({ label, hint }: { label: string; hint?: string }) {
  return (
    <div style={{ marginTop: 28, marginBottom: 10 }}>
      <div style={{
        fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase",
        color: "var(--muted)", fontWeight: 700,
      }}>
        {label}
      </div>
      {hint && <p className="subtitle" style={{ margin: "4px 0 0" }}>{hint}</p>}
    </div>
  );
}

type Integration = {
  company_id: string;
  phone_number_id: string;
  waba_id: string | null;
  access_token_secret_id: string | null;
  verify_token: string;
  display_number: string | null;
  default_salesperson_id: string | null;
  active: boolean;
} | null;

type Msg = {
  id: string;
  contact_id: string | null;
  salesperson_id: string | null;
  direction: "in" | "out";
  counterparty: string;
  body: string | null;
  status: string | null;
  created_at: string;
};

export default async function WhatsAppPage({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
  // fallback:"first" — this page EDITS one company's settings, so an unscoped
  // super admin lands on the first company rather than on nothing. That is the
  // one way these pages differ from the aggregating ones, and it now lives in
  // resolveScope instead of being re-derived here.
  const ctx = await resolveScope(await searchParams, { require: "any", fallback: "first" });
  const { supabase, isSuper, companies, companyId } = ctx;
  if (ctx.role !== "admin" && !isSuper) {
    return <><h2>WhatsApp</h2><div className="empty">Managers only.</div></>;
  }


  const [{ data: integ }, { data: msgs }, { data: contacts }, { data: members }] = await Promise.all([
    companyId
      ? supabase.from("whatsapp_integrations").select("*").eq("company_id", companyId).maybeSingle<Integration>()
      : Promise.resolve({ data: null }),
    companyId
      ? supabase.from("whatsapp_messages").select("id, contact_id, salesperson_id, direction, counterparty, body, status, created_at")
          .eq("company_id", companyId).order("created_at", { ascending: false }).limit(200).returns<Msg[]>()
      : Promise.resolve({ data: [] }),
    supabase.from("contacts").select("id, name").returns<{ id: string; name: string | null }[]>(),
    companyId
      ? supabase.from("profiles").select("id, full_name").eq("company_id", companyId).eq("role", "salesperson").order("full_name")
          .returns<{ id: string; full_name: string | null }[]>()
      : Promise.resolve({ data: [] }),
  ]);

  const leadName = new Map((contacts ?? []).map((c) => [c.id, c.name ?? ""]));
  const rows = msgs ?? [];

  return (
    <>
      <h2>💬 WhatsApp</h2>
      <p className="subtitle">
        All WhatsApp goes through one company number, so you see every conversation your team has with customers.
        Each telecaller sees only their own leads&apos; chats; you see everyone&apos;s.
      </p>

      {isSuper && <CompanyPicker companies={companies} selected={companyId} />}

      {/* ── Daily half: what this page is actually opened for ── */}

      {isSuper && (
        <>
          <Section label="📡 Platform-wide" hint="Sends to founders across every company — not scoped to the company picker above." />
          <PlatformSender companies={companies} />
        </>
      )}

      {companyId && (
        <>
          <Section label="👥 Telecaller watchers" hint="Check daily. Each rep's own WhatsApp, read-only — see who's connected and what came in." />
          <TelecallerWhatsApp
            companyId={companyId}
            companyName={companies.find((c) => c.id === companyId)?.name ?? null}
            reps={members ?? []}
            isSuper={isSuper}
          />
        </>
      )}

      <Section label="💬 Team inbox" hint="Every conversation on the company's own WhatsApp number." />
      {rows.length === 0 ? (
        <div className="empty">No WhatsApp messages yet. Connect the number below, then messages appear here.</div>
      ) : (
        <WhatsAppInbox
          initialMessages={rows}
          companyId={companyId!}
          leadName={leadName}
        />
      )}

      {/* ── Set up once, then leave alone ── */}

      <Section label="⚙️ Business number — set up once" hint="How customers message the company, and whether it's actually working." />
      <WhatsAppHealth isSuper={isSuper} companyId={companyId} />

      {companyId ? (
        <WhatsAppSetup
          companyId={companyId}
          integration={integ ?? null}
          webhookUrl={WEBHOOK_URL}
          members={members ?? []}
        />
      ) : (
        <div className="empty">{isSuper ? "Create a company first, then connect its WhatsApp here." : "Your account isn't linked to a company yet."}</div>
      )}

      {/* Founder notifications only, kept below the Cloud API setup on purpose:
          the setup above is how CUSTOMERS are messaged, and an experimental
          provider must never read as a swap for that. */}
      {companyId && <ProviderPicker companyId={companyId} companyName={companies.find((c) => c.id === companyId)?.name ?? null} />}
    </>
  );
}
