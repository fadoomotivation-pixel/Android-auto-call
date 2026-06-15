"use server";

import { createClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { redirect } from "next/navigation";

export async function createTelecallerAction(formData: FormData) {
  const companyId = formData.get("company_id") as string;
  const name = formData.get("name") as string;
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const phone = formData.get("phone") as string;

  if (!companyId || !name || !email || !password) {
    throw new Error("Missing required fields");
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: pa } = await supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!pa) throw new Error("Super admin only");

  // Create auth user using service role key
  const adminAuth = getServiceSupabase().auth.admin;
  
  const { data: authData, error: authError } = await adminAuth.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authError) {
    throw new Error(`Failed to create Auth user: ${authError.message}`);
  }

  const newUserId = authData.user.id;

  // Insert profile using regular client (or service client, but RLS on profiles might allow super admins if we have a policy. Wait, let's use service client to bypass RLS just in case)
  const serviceDb = getServiceSupabase();
  const { error: profileError } = await serviceDb.from("profiles").update({
    company_id: companyId,
    full_name: name,
    phone: phone || null,
    role: "salesperson",
    is_active: true,
  }).eq("id", newUserId);

  if (profileError) {
    // Note: profile is auto-created by a trigger usually, so we update it here.
    // If it doesn't exist, the trigger might have failed.
    throw new Error(`Failed to update Profile: ${profileError.message}`);
  }

  redirect("/dashboard/platform/telecallers");
}
