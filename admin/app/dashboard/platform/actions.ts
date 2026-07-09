"use server";

import { createClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { revalidatePath } from "next/cache";

export type ActionResult = { ok: boolean; message?: string; error?: string };

/** Returns the caller's user id if they're a platform (super) admin, else null. */
async function superAdminId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: pa } = await supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  return pa ? user.id : null;
}

/** Rename a company. */
export async function renameCompanyAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  if (!(await superAdminId())) return { ok: false, error: "Super admin only" };
  const companyId = String(formData.get("company_id") || "");
  const name = String(formData.get("name") || "").trim();
  if (!companyId || !name) return { ok: false, error: "Company and name are required" };

  const { error } = await getServiceSupabase().from("companies").update({ name }).eq("id", companyId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard/platform");
  return { ok: true, message: "Company renamed" };
}

/**
 * Delete a company and everything under it. Company FKs cascade (contacts, calls,
 * campaigns, follow-ups …); its telecaller profiles are SET NULL, so we capture
 * and remove their auth accounts first — but never a platform admin or the caller.
 */
export async function deleteCompanyAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const adminId = await superAdminId();
  if (!adminId) return { ok: false, error: "Super admin only" };
  const companyId = String(formData.get("company_id") || "");
  if (!companyId) return { ok: false, error: "Company is required" };

  const db = getServiceSupabase();

  // Users belonging to this company (captured before the cascade unlinks them).
  const { data: members } = await db.from("profiles").select("id").eq("company_id", companyId);
  const memberIds = (members ?? []).map((m) => m.id as string);

  // Protect platform admins (and the caller) from deletion.
  const { data: admins } = await db.from("platform_admins").select("user_id");
  const adminIds = new Set<string>([adminId, ...((admins ?? []).map((a) => a.user_id as string))]);

  // Delete the company row → cascades all of its data.
  const { error } = await db.from("companies").delete().eq("id", companyId);
  if (error) return { ok: false, error: error.message };

  // Remove the company's telecaller logins (best effort; company is already gone).
  const auth = db.auth.admin;
  for (const id of memberIds) {
    if (adminIds.has(id)) continue;
    await auth.deleteUser(id).catch(() => {});
  }

  revalidatePath("/dashboard/platform");
  revalidatePath("/dashboard/platform/telecallers");
  return { ok: true, message: "Company deleted" };
}

/** Reset a telecaller's login password. */
export async function resetTelecallerPasswordAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  if (!(await superAdminId())) return { ok: false, error: "Super admin only" };
  const userId = String(formData.get("user_id") || "");
  const password = String(formData.get("password") || "");
  if (!userId) return { ok: false, error: "User is required" };
  if (password.length < 6) return { ok: false, error: "Password must be at least 6 characters" };

  const { error } = await getServiceSupabase().auth.admin.updateUserById(userId, { password });
  if (error) return { ok: false, error: error.message };
  return { ok: true, message: "Password updated" };
}

/** Delete a telecaller account (auth user + profile via cascade). */
export async function deleteTelecallerAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const adminId = await superAdminId();
  if (!adminId) return { ok: false, error: "Super admin only" };
  const userId = String(formData.get("user_id") || "");
  if (!userId) return { ok: false, error: "User is required" };
  if (userId === adminId) return { ok: false, error: "You can't delete your own account here" };

  const db = getServiceSupabase();
  const { data: pa } = await db.from("platform_admins").select("user_id").eq("user_id", userId).maybeSingle();
  if (pa) return { ok: false, error: "That account is a super admin and can't be deleted here" };

  const { error } = await db.auth.admin.deleteUser(userId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard/platform/telecallers");
  return { ok: true, message: "Telecaller deleted" };
}
