"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Turn a number the rep has been talking to into a real lead.
 *
 * The unknown-numbers table could only ever POINT at these — thirty-four people
 * one telecaller both rang and messaged, in the CRM under no company at all.
 * Capturing one by hand meant copying a phone number into another screen and
 * leaving the conversation that made it interesting behind.
 *
 * wa_capture_lead does the whole thing: creates the contact in the rep's
 * company, assigns it to them, and back-links every stored message from that
 * number so the lead opens with its history rather than as a blank row. It is
 * idempotent on the phone number — pressing this twice adopts the existing
 * contact instead of splitting one buyer across two leads, which is the worse
 * failure of the two.
 *
 * The RPC is security definer and gated on is_super_admin(), so the session
 * client is the right caller: a non-super-admin gets an exception, not a lead.
 */
export async function captureLead(formData: FormData) {
  const rep = String(formData.get("rep") ?? "");
  const peer = String(formData.get("peer") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const days = String(formData.get("days") ?? "");

  if (!rep || !peer) return;

  const supabase = await createClient();
  await supabase.rpc("wa_capture_lead", {
    p_rep: rep,
    p_peer: peer,
    p_name: name || null,
  });

  // The thread the button sits on, and the rep page whose unknown-numbers list
  // this number just left. Both are now wrong until they are re-read.
  const qs = new URLSearchParams({ rep });
  if (days && days !== "7") qs.set("days", days);
  revalidatePath(`/dashboard/platform/telecallers-activity?${qs.toString()}`);
  revalidatePath("/dashboard/platform/telecallers-activity");
}
