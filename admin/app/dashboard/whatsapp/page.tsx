import { createClient } from "@/lib/supabase/server";
import { WhatsAppSetup } from "./WhatsAppSetup";
import { CompanyPicker } from "./CompanyPicker";
import { WhatsAppInbox } from "./WhatsAppInbox";

const WEBHOOK_URL = "https://rqgkzamuohdvttnkluzn.supabase.co/functions/v1/whatsapp-webhook";

type Integration = {
  company_id: string;
  phone_number_id: string;
  waba_id: string | null;
  access_token: string;
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
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: prof }, { data: pa }] = await Promise.all([
    supabase.from("profiles").select("role, company_id").eq("id", user!.id).maybeSingle<{ role: string; company_id: string | null }>(),
    supabase.from("platform_admins").select("user_id").eq("user_id", user!.id).maybeSingle(),
  ]);
  const isSuper = !!pa;
  if (prof?.role !== "admin" && !isSuper) {
    return <><h2>WhatsApp</h2><div className="empty">Managers only.</div></>;
  }

  // Super admins can pick any company; company admins are scoped to their own.
  const { data: companies } = isSuper
    ? await supabase.from("companies").select("id, name").order("name").returns<{ id: string; name: string | null }[]>()
    : { data: null };
  const companyId = isSuper ? (sp.company ?? companies?.[0]?.id ?? null) : (prof?.company_id ?? null);

  const [{ data: integ }, { data: msgs }, { data: people }, { data: contacts }, { data: members }] = await Promise.all([
    companyId
      ? supabase.from("whatsapp_integrations").select("*").eq("company_id", companyId).maybeSingle<Integration>()
      : Promise.resolve({ data: null }),
    companyId
      ? supabase.from("whatsapp_messages").select("id, contact_id, salesperson_id, direction, counterparty, body, status, created_at")
          .eq("company_id", companyId).order("created_at", { ascending: false }).limit(200).returns<Msg[]>()
      : Promise.resolve({ data: [] }),
    supabase.from("profiles").select("id, full_name").returns<{ id: string; full_name: string | null }[]>(),
    supabase.from("contacts").select("id, name").returns<{ id: string; name: string | null }[]>(),
    companyId
      ? supabase.from("profiles").select("id, full_name").eq("company_id", companyId).eq("role", "salesperson").order("full_name")
          .returns<{ id: string; full_name: string | null }[]>()
      : Promise.resolve({ data: [] }),
  ]);

  const repName = new Map((people ?? []).map((p) => [p.id, p.full_name ?? "—"]));
  const leadName = new Map((contacts ?? []).map((c) => [c.id, c.name ?? ""]));
  const rows = msgs ?? [];

  return (
    <>
      <h2>💬 WhatsApp</h2>
      <p className="subtitle">
        All WhatsApp goes through one company number, so you see every conversation your team has with customers.
        Each telecaller sees only their own leads&apos; chats; you see everyone&apos;s.
      </p>

      {isSuper && (
        <CompanyPicker companies={companies ?? []} selected={companyId} />
      )}

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

      <h3 style={{ marginTop: 28, marginBottom: 16 }}>Team Inbox</h3>
      {rows.length === 0 ? (
        <div className="empty">No WhatsApp messages yet. Connect the number above, then messages appear here.</div>
      ) : (
        <WhatsAppInbox 
          initialMessages={rows} 
          companyId={companyId!} 
          leadName={leadName} 
        />
      )}
    </>
  );
}
