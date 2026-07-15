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

/**
 * Set a company's white-label branding — brand colour + logo — with no technical
 * steps: pick a colour, upload a logo, save. The logo goes to the public
 * `company-logos` bucket and its URL is stored on the company. Super-admin only.
 */
export async function setCompanyBrandingAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  if (!(await superAdminId())) return { ok: false, error: "Super admin only" };
  const companyId = String(formData.get("company_id") || "");
  if (!companyId) return { ok: false, error: "Company is required" };

  // Colour: accept #RGB / #RRGGBB, or blank to clear (fall back to default).
  const rawColor = String(formData.get("brand_color") || "").trim();
  let brandColor: string | null = null;
  if (rawColor) {
    if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(rawColor)) {
      return { ok: false, error: "Colour must be a hex like #0E7C66" };
    }
    brandColor = rawColor.toUpperCase();
  }

  // Which branded APK build this company uses (a GitHub release channel).
  const rawChannel = String(formData.get("app_channel") || "").trim();
  const CHANNELS = ["android-latest", "android-sndeveloper", "android-manasproperty"];
  const appChannel: string | null = rawChannel && CHANNELS.includes(rawChannel) ? rawChannel : null;

  const db = getServiceSupabase();
  const update: { brand_color: string | null; app_channel: string | null; logo_url?: string | null } = {
    brand_color: brandColor,
    app_channel: appChannel,
  };

  // Optional logo upload → public bucket → store its URL.
  const logo = formData.get("logo");
  if (logo instanceof File && logo.size > 0) {
    if (logo.size > 2_097_152) return { ok: false, error: "Logo must be under 2 MB" };
    const ext = logo.type === "image/png" ? "png"
      : logo.type === "image/webp" ? "webp"
      : logo.type === "image/svg+xml" ? "svg"
      : logo.type === "image/jpeg" ? "jpg" : "";
    if (!ext) return { ok: false, error: "Logo must be PNG, JPG, WEBP or SVG" };
    const path = `${companyId}/logo-${Date.now()}.${ext}`;
    const bytes = new Uint8Array(await logo.arrayBuffer());
    const { error: upErr } = await db.storage.from("company-logos").upload(path, bytes, {
      contentType: logo.type, upsert: true,
    });
    if (upErr) return { ok: false, error: `Logo upload failed: ${upErr.message}` };
    update.logo_url = db.storage.from("company-logos").getPublicUrl(path).data.publicUrl;
  } else if (String(formData.get("remove_logo") || "") === "1") {
    update.logo_url = null;
  }

  const { error } = await db.from("companies").update(update).eq("id", companyId);
  if (error) return { ok: false, error: error.message };

  // One-click "force update" for this company's app channel (affects everyone on
  // that channel). When on, the app makes the next update mandatory.
  const channel = appChannel || "android-latest";
  const force = String(formData.get("force") || "") === "1";
  await db.from("app_update_policy").upsert(
    { channel, force, updated_at: new Date().toISOString() },
    { onConflict: "channel" },
  );

  revalidatePath("/dashboard/platform");
  return { ok: true, message: "Branding saved" };
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
