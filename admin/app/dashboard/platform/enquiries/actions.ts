"use server";

import { createClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { revalidatePath } from "next/cache";

const STATUSES = ["new", "contacted", "won", "lost"] as const;

/** Super admin check on the server, from the signed-in session. */
export async function isSuperAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: pa } = await supabase
    .from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle();
  return !!pa;
}

/** Save status + notes for one website enquiry. Super admin only. */
export async function saveEnquiryAction(formData: FormData): Promise<void> {
  if (!(await isSuperAdmin())) throw new Error("Super admin only");
  const id = String(formData.get("id") || "");
  const status = String(formData.get("status") || "");
  const notes = String(formData.get("notes") ?? "").slice(0, 5000);
  if (!id || !(STATUSES as readonly string[]).includes(status)) throw new Error("Bad input");
  const { error } = await getServiceSupabase()
    .from("site999_onboarding").update({ status, notes: notes || null }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/platform/enquiries");
}
