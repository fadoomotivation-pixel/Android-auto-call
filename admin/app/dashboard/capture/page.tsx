import { createClient } from "@/lib/supabase/server";
import { CompanyPicker } from "../whatsapp/CompanyPicker";
import { CaptureSetup } from "./CaptureSetup";

const FUNCTION_URL = "https://rqgkzamuohdvttnkluzn.supabase.co/functions/v1/lead-capture";

type Config = {
  company_id: string;
  capture_token: string;
  default_salesperson_id: string | null;
  welcome_enabled: boolean;
  welcome_template: string | null;
  welcome_template_lang: string;
  active: boolean;
} | null;

export default async function CapturePage({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: prof }, { data: pa }] = await Promise.all([
    supabase.from("profiles").select("role, company_id").eq("id", user!.id).maybeSingle<{ role: string; company_id: string | null }>(),
    supabase.from("platform_admins").select("user_id").eq("user_id", user!.id).maybeSingle(),
  ]);
  const isSuper = !!pa;
  if (prof?.role !== "admin" && !isSuper) {
    return <><h2>Lead Capture</h2><div className="empty">Managers only.</div></>;
  }

  const { data: companies } = isSuper
    ? await supabase.from("companies").select("id, name").order("name").returns<{ id: string; name: string | null }[]>()
    : { data: null };
  const companyId = isSuper ? (sp.company ?? companies?.[0]?.id ?? null) : (prof?.company_id ?? null);

  const [{ data: config }, { data: members }] = await Promise.all([
    companyId
      ? supabase.from("lead_capture_config").select("*").eq("company_id", companyId).maybeSingle<Config>()
      : Promise.resolve({ data: null }),
    companyId
      ? supabase.from("profiles").select("id, full_name").eq("company_id", companyId).eq("role", "salesperson").order("full_name")
          .returns<{ id: string; full_name: string | null }[]>()
      : Promise.resolve({ data: [] }),
  ]);

  return (
    <>
      <h2>🪝 Lead Capture</h2>
      <p className="subtitle">
        Send leads from any website form, landing page, or ad into the CRM automatically — no Zapier.
        New leads are assigned to your chosen rep and can get an instant WhatsApp welcome.
      </p>

      {isSuper && <CompanyPicker companies={companies ?? []} selected={companyId} />}

      {companyId ? (
        <CaptureSetup
          companyId={companyId}
          config={config ?? null}
          functionUrl={FUNCTION_URL}
          members={members ?? []}
        />
      ) : (
        <div className="empty">{isSuper ? "Create a company first, then set up lead capture here." : "Your account isn't linked to a company yet."}</div>
      )}
    </>
  );
}
