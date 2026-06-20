import { createClient } from "@/lib/supabase/server";
import { CompanyPicker } from "../whatsapp/CompanyPicker";
import { PbxSetup } from "./PbxSetup";

const CDR_URL = "https://rqgkzamuohdvttnkluzn.supabase.co/functions/v1/pbx-cdr";

type Config = {
  company_id: string;
  pbx_type: "freeswitch" | "asterisk";
  cdr_secret: string;
  active: boolean;
} | null;

export default async function PbxPage({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: prof }, { data: pa }] = await Promise.all([
    supabase.from("profiles").select("role, company_id").eq("id", user!.id).maybeSingle<{ role: string; company_id: string | null }>(),
    supabase.from("platform_admins").select("user_id").eq("user_id", user!.id).maybeSingle(),
  ]);
  const isSuper = !!pa;
  if (prof?.role !== "admin" && !isSuper) {
    return <><h2>Cloud calling (PBX)</h2><div className="empty">Managers only.</div></>;
  }

  const { data: companies } = isSuper
    ? await supabase.from("companies").select("id, name").order("name").returns<{ id: string; name: string | null }[]>()
    : { data: null };
  const companyId = isSuper ? (sp.company ?? companies?.[0]?.id ?? null) : (prof?.company_id ?? null);

  const { data: config } = companyId
    ? await supabase.from("pbx_config").select("*").eq("company_id", companyId).maybeSingle<Config>()
    : { data: null };

  return (
    <>
      <h2>☎️ Cloud calling (PBX)</h2>
      <p className="subtitle">
        Connect your own FreeSWITCH or Asterisk server. Calls are recorded on the PBX and saved to
        Google Drive with an AI summary — no per-minute telephony cost.
      </p>

      {isSuper && <CompanyPicker companies={companies ?? []} selected={companyId} />}

      {companyId ? (
        <PbxSetup companyId={companyId} config={config ?? null} cdrUrl={CDR_URL} />
      ) : (
        <div className="empty">{isSuper ? "Create a company first, then connect its PBX here." : "Your account isn't linked to a company yet."}</div>
      )}
    </>
  );
}
