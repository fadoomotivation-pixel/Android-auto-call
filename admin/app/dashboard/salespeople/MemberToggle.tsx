"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function MemberToggle({ userId, active }: { userId: string; active: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    const supabase = createClient();
    await supabase.rpc("admin_set_member_active", { target_user: userId, active: !active });
    setBusy(false);
    router.refresh();
  }

  return (
    <button
      className="link"
      onClick={toggle}
      disabled={busy}
      style={{ color: active ? "var(--bad)" : "var(--good)" }}
    >
      {busy ? "…" : active ? "Deactivate" : "Activate"}
    </button>
  );
}
