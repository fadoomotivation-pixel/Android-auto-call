import { createClient } from "@/lib/supabase/server";
import { WhatsAppSetup } from "./WhatsAppSetup";

const WEBHOOK_URL = "https://rqgkzamuohdvttnkluzn.supabase.co/functions/v1/whatsapp-webhook";

type Integration = {
  company_id: string;
  phone_number_id: string;
  waba_id: string | null;
  access_token: string;
  verify_token: string;
  display_number: string | null;
  active: boolean;
} | null;

type Msg = {
  id: string;
  company_id: string;
  contact_id: string | null;
  salesperson_id: string | null;
  direction: "in" | "out";
  counterparty: string;
  body: string | null;
  status: string | null;
  created_at: string;
};

export default async function WhatsAppPage() {
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

  const companyId = prof?.company_id ?? null;
  const [{ data: integ }, { data: msgs }, { data: people }, { data: contacts }] = await Promise.all([
    companyId
      ? supabase.from("whatsapp_integrations").select("*").eq("company_id", companyId).maybeSingle<Integration>()
      : Promise.resolve({ data: null }),
    supabase.from("whatsapp_messages").select("id, company_id, contact_id, salesperson_id, direction, counterparty, body, status, created_at")
      .order("created_at", { ascending: false }).limit(200).returns<Msg[]>(),
    supabase.from("profiles").select("id, full_name").returns<{ id: string; full_name: string | null }[]>(),
    supabase.from("contacts").select("id, name").returns<{ id: string; name: string | null }[]>(),
  ]);

  const repName = new Map((people ?? []).map((p) => [p.id, p.full_name ?? "—"]));
  const leadName = new Map((contacts ?? []).map((c) => [c.id, c.name ?? ""]));
  const rows = msgs ?? [];

  return (
    <>
      <h2>💬 WhatsApp</h2>
      <p className="subtitle">
        All WhatsApp goes through your company number, so you see every conversation your team has with customers.
      </p>

      {companyId && (
        <WhatsAppSetup companyId={companyId} integration={integ ?? null} webhookUrl={WEBHOOK_URL} />
      )}

      <h3 style={{ marginTop: 28 }}>Recent conversations</h3>
      {rows.length === 0 ? (
        <div className="empty">No WhatsApp messages yet. Connect your number above, then messages appear here.</div>
      ) : (
        <table>
          <thead>
            <tr><th>When</th><th>Direction</th><th>Customer</th><th>Rep</th><th>Message</th><th>Status</th></tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id}>
                <td style={{ whiteSpace: "nowrap" }}>{new Date(m.created_at).toLocaleString()}</td>
                <td>{m.direction === "in" ? "⬅️ in" : "➡️ out"}</td>
                <td>{(m.contact_id && leadName.get(m.contact_id)) || m.counterparty}</td>
                <td>{m.salesperson_id ? repName.get(m.salesperson_id) ?? "—" : "—"}</td>
                <td style={{ maxWidth: 360 }}>{m.body}</td>
                <td style={{ color: "var(--muted)", fontSize: 12 }}>{m.status ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
