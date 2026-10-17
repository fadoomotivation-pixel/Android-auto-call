"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

// "Continue with Google" through Supabase Google OAuth. Google sends the user
// back to /auth/callback, which signs them in and, for a brand-new account,
// asks for the company name on /signup/company.
export function GoogleButton({ demo = false, label = "Continue with Google" }: { demo?: boolean; label?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const next = `${window.location.origin}/auth/callback${demo ? "?demo=1" : ""}`;
      const { error: err } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: next },
      });
      if (err) throw err;
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      setError(
        /provider is not enabled|Unsupported provider/i.test(msg)
          ? "Google sign-in is not switched on yet. Please use email for now."
          : msg || "Could not open Google sign-in.",
      );
      setBusy(false);
    }
  }

  return (
    <div>
      <button type="button" className="su-google" onClick={go} disabled={busy}>
        <img src="/google-g.svg" width={18} height={18} alt="" aria-hidden />
        {busy ? "Opening Google…" : label}
      </button>
      {error && <div className="su-error">{error}</div>}
    </div>
  );
}
