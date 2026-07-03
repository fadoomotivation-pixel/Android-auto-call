import { createClient } from "@/lib/supabase/server";
import { NewTelecallerForm } from "./NewTelecallerForm";

export default async function NewTelecallerPage() {
  const supabase = await createClient();
  const { data: companies } = await supabase
    .from("companies")
    .select("id, name")
    .order("name", { ascending: true });

  return (
    <>
      <h2>Create New Telecaller</h2>
      <p className="subtitle">Provision a telecaller account and assign them to a company.</p>
      
      <div className="login-box" style={{ margin: 0, width: "100%", maxWidth: 400 }}>
        <NewTelecallerForm companies={companies || []} />
      </div>
    </>
  );
}
