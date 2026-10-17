"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { GoogleButton } from "@/app/components/GoogleButton";
import "./signup.css";

// The one sign-up card, used in the landing hero and on /signup.
// Email sign-up keeps the existing company-creation path: handle_new_user()
// creates the company from this metadata (role admin + company_name).
// Google sign-up has no form, so the company name is asked on /signup/company.
export function SignupForm({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [companyName, setCompanyName] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [demo, setDemo] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const supabase = createClient();
      const { data, error: err } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName, role: "admin", company_name: companyName, load_demo: demo },
          emailRedirectTo: `${window.location.origin}/auth/callback${demo ? "?demo=1" : ""}`,
        },
      });
      if (err) throw err;
      if (!data.session) {
        setNotice("Account created. Open the email we sent you and tap the link to finish.");
        return;
      }
      if (demo) await supabase.rpc("load_demo_leads").then(() => undefined, () => undefined);
      router.push("/dashboard/actions");
      router.refresh();
    } catch (e: any) {
      setError(e?.message ?? "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`su-card ${compact ? "su-compact" : ""}`} id="signup">
      <div className="su-title">Create your company</div>
      <div className="su-sub">Free to use. No card needed.</div>

      <GoogleButton demo={demo} />
      <div className="su-or"><span>or</span></div>

      <form onSubmit={submit}>
        <input className="su-in" placeholder="Company name" value={companyName} onChange={(e) => setCompanyName(e.target.value)} required />
        <input className="su-in" placeholder="Your name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        <input className="su-in" type="email" placeholder="Work email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        <input className="su-in" type="password" placeholder="Password (6+ characters)" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} autoComplete="new-password" />
        <label className="su-toggle">
          <span>
            <b>Load demo leads</b>
            <small>10 sample leads to try calling. Safe to delete.</small>
          </span>
          <input type="checkbox" checked={demo} onChange={(e) => setDemo(e.target.checked)} />
          <i aria-hidden />
        </label>
        <button className="su-primary" type="submit" disabled={busy}>
          {busy ? "Please wait…" : "Create free account"}
        </button>
      </form>

      {error && <div className="su-error">{error}</div>}
      {notice && <div className="su-notice">{notice}</div>}
      <div className="su-foot">
        Already have an account? <a href="/login">Sign in</a>
      </div>
    </div>
  );
}
