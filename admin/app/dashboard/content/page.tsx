import { createClient } from "@/lib/supabase/server";
import { ContentLibrary } from "./ContentLibrary";

type Asset = {
  id: string;
  kind: string;
  title: string;
  url: string;
  description: string | null;
  active: boolean;
  created_at: string;
};

export default async function ContentPage({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: prof }, { data: pa }] = await Promise.all([
    supabase.from("profiles").select("role, company_id").eq("id", user!.id).maybeSingle<{ role: string; company_id: string | null }>(),
    supabase.from("platform_admins").select("user_id").eq("user_id", user!.id).maybeSingle(),
  ]);
  const isSuper = !!pa;
  if (prof?.role !== "admin" && !isSuper) {
    return <><h2>Content Library</h2><div className="empty">Managers only.</div></>;
  }

  const { data: companies } = isSuper
    ? await supabase.from("companies").select("id, name").order("name").returns<{ id: string; name: string | null }[]>()
    : { data: null };
  const companyId = isSuper ? (sp.company ?? companies?.[0]?.id ?? null) : (prof?.company_id ?? null);

  const { data: assets } = companyId
    ? await supabase.from("content_assets")
        .select("id, kind, title, url, description, active, created_at")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .returns<Asset[]>()
    : { data: null };

  return (
    <>
      <h2>📚 Content Library</h2>
      <p style={{ color: "var(--muted)", marginTop: -6 }}>
        Brochures, videos, reviews &amp; testimonials your reps can share with buyers over WhatsApp.
        Shared links are tracked — when a buyer opens one, the lead is automatically re-engaged.
      </p>
      {!companyId
        ? <div className="empty">No company selected.</div>
        : <ContentLibrary companyId={companyId} assets={assets ?? []} />}
    </>
  );
}
