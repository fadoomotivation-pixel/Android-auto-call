"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function createCompanyAction(formData: FormData) {
  const name = formData.get("name") as string;
  if (!name) throw new Error("Name is required");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: pa } = await supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!pa) throw new Error("Super admin only");

  // Create company
  const { error } = await supabase.from("companies").insert({
    name,
    owner_id: user.id, // Or null if no direct owner
  });

  if (error) {
    throw new Error(error.message);
  }

  redirect("/dashboard/platform");
}
