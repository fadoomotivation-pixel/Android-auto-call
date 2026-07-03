"use server";

import { createClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { redirect } from "next/navigation";

export async function createTelecallerAction(prevState: any, formData: FormData) {
  try {
    const companyId = formData.get("company_id") as string;
    const name = formData.get("name") as string;
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const phone = formData.get("phone") as string;

    if (!companyId || !name || !email || !password) {
      return { error: "Missing required fields" };
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Unauthorized" };

    // Check if super admin or company admin
    const { data: pa } = await supabase
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();

    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id, role")
      .eq("id", user.id)
      .single();

    const isSuper = !!pa;
    const isAdminOfCompany = profile?.role === "admin" && profile?.company_id === companyId;

    if (!isSuper && !isAdminOfCompany) {
      return { error: "You don't have permission to add a telecaller to this company." };
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return { error: "SUPABASE_SERVICE_ROLE_KEY is not defined in environment variables. Please add it to create users." };
    }

    const adminAuth = getServiceSupabase().auth.admin;
    
    const { data: authData, error: authError } = await adminAuth.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError) {
      return { error: `Failed to create Auth user: ${authError.message}` };
    }

    const newUserId = authData.user.id;

    const serviceDb = getServiceSupabase();
    const { error: profileError } = await serviceDb.from("profiles").update({
      company_id: companyId,
      full_name: name,
      phone: phone || null,
      role: "salesperson",
      is_active: true,
    }).eq("id", newUserId);

    if (profileError) {
      return { error: `Failed to update Profile: ${profileError.message}` };
    }

  } catch (e: any) {
    return { error: e.message || "An unexpected error occurred" };
  }
  
  redirect("/dashboard/platform/telecallers");
}
