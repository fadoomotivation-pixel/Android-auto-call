"use server";

import { createClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { revalidatePath } from "next/cache";

export type EditResult = { ok: boolean; message?: string; error?: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Change a telecaller's name and login email.
 *
 * Who may: the super admin, for any telecaller in any company; a company admin,
 * only for the telecallers in their OWN company. The check is done here, on the
 * server, against the database — never trusted from the form.
 *
 * The email is the login, so it changes in Supabase Auth, set as already
 * confirmed: reps often have a company address that receives no mail, and a
 * confirmation link they can't open would lock them out. The password is not
 * touched, and the rep's current session on the phone keeps working; the new
 * email is only needed the next time they sign in.
 */
export async function updateTelecallerAction(_prev: EditResult, formData: FormData): Promise<EditResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in again." };

  const db = getServiceSupabase();
  const [{ data: me }, { data: pa }] = await Promise.all([
    db.from("profiles").select("role, company_id").eq("id", user.id).maybeSingle(),
    db.from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle(),
  ]);
  const isSuper = !!pa;
  if (!isSuper && me?.role !== "admin") return { ok: false, error: "Only an admin can edit a telecaller." };

  const userId = String(formData.get("user_id") || "");
  const name = String(formData.get("full_name") || "").trim().replace(/\s+/g, " ");
  const email = String(formData.get("email") || "").trim().toLowerCase();
  if (!userId) return { ok: false, error: "No telecaller picked." };
  if (!name) return { ok: false, error: "Name can't be empty." };
  if (name.length > 80) return { ok: false, error: "Name is too long. Keep it under 80 letters." };
  if (!EMAIL.test(email)) return { ok: false, error: "That email doesn't look right. Example: name@company.com" };

  const [{ data: target }, { data: targetIsSuper }] = await Promise.all([
    db.from("profiles").select("id, role, company_id, full_name").eq("id", userId).maybeSingle(),
    db.from("platform_admins").select("user_id").eq("user_id", userId).maybeSingle(),
  ]);
  if (!target) return { ok: false, error: "That telecaller wasn't found." };
  // A super admin's login is never edited from a team page.
  if (targetIsSuper) return { ok: false, error: "This account is a super admin and can't be edited here." };
  // A company admin edits their own company's telecallers and no one else's.
  if (!isSuper && (target.company_id !== me?.company_id || target.role !== "salesperson")) {
    return { ok: false, error: "You can only edit telecallers in your own company." };
  }

  const { data: authUser, error: getErr } = await db.auth.admin.getUserById(userId);
  if (getErr || !authUser?.user) return { ok: false, error: "Couldn't read this telecaller's login." };
  const oldEmail = (authUser.user.email ?? "").toLowerCase();

  if (email !== oldEmail) {
    const { error } = await db.auth.admin.updateUserById(userId, { email, email_confirm: true });
    if (error) {
      return {
        ok: false,
        error: /already|registered|exists/i.test(error.message)
          ? "Another login already uses this email. Pick a different one."
          : `Email not changed: ${error.message}`,
      };
    }
  }

  if (name !== (target.full_name ?? "")) {
    const { error } = await db.from("profiles").update({ full_name: name }).eq("id", userId);
    if (error) {
      return {
        ok: false,
        error: email !== oldEmail
          ? `The email was changed, but the name was not: ${error.message}`
          : `Name not changed: ${error.message}`,
      };
    }
    // Kept in step so anything reading the auth record shows the same name.
    await db.auth.admin.updateUserById(userId, {
      user_metadata: { ...(authUser.user.user_metadata ?? {}), full_name: name },
    });
  }

  revalidatePath("/dashboard/salespeople");
  revalidatePath("/dashboard/platform/telecallers");

  if (email === oldEmail && name === (target.full_name ?? "")) return { ok: true, message: "Nothing to change." };
  return {
    ok: true,
    message: email !== oldEmail
      ? `Saved. ${name} now signs in with ${email}. The password is the same.`
      : "Saved.",
  };
}
