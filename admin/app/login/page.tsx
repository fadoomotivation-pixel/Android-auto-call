"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [companyName, setCompanyName] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    // Create the browser client here (on click), not during render, so the page
    // can be statically prerendered at build time without Supabase env vars.
    const supabase = createClient();
    try {
      if (mode === "signup") {
        // The company is created server-side by the new-user trigger from this
        // metadata (full_name + role + company_name) — no extra RPC needed.
        const { data, error: signErr } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName, role: "admin", company_name: companyName } },
        });
        if (signErr) throw signErr;

        // If email confirmation is enabled, signUp returns no session yet.
        if (!data.session) {
          setNotice("Account created. Please confirm your email, then sign in.");
          setMode("signin");
          return;
        }
      } else {
        const { error: signErr } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signErr) throw signErr;
      }
      // Managers land on the action queue, not analytics. Operations should
      // open with "what needs me today"; the twenty-three reporting pages are
      // all still one click away in the sidebar.
      router.push("/dashboard/today");
      router.refresh();
    } catch (err: any) {
      setError(err?.message ?? "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-box" onSubmit={handleSubmit}>
        <h1>SalesAutoCall</h1>
        <p>{mode === "signin" ? "Admin sign in" : "Create your company"}</p>

        {mode === "signup" && (
          <>
            <div className="field">
              <label>Company name</label>
              <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} required />
            </div>
            <div className="field">
              <label>Your name</label>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </div>
          </>
        )}

        <div className="field">
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="field">
          <label>Password</label>
          <div style={{ position: "relative" }}>
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              style={{ paddingRight: 44 }}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              style={{
                position: "absolute",
                right: 8,
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--muted)",
                fontSize: 16,
                padding: 4,
                lineHeight: 1,
              }}
            >
              {showPassword ? "🙈" : "👁️"}
            </button>
          </div>
        </div>

        <button className="primary" type="submit" disabled={busy}>
          {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create company"}
        </button>

        {error && <div className="error">{error}</div>}
        {notice && <div style={{ color: "var(--good)", fontSize: 13, marginTop: 12 }}>{notice}</div>}

        <div style={{ marginTop: 16, textAlign: "center" }}>
          {mode === "signin" ? (
            <button type="button" className="link" onClick={() => setMode("signup")}>
              No company yet? Create one
            </button>
          ) : (
            <button type="button" className="link" onClick={() => setMode("signin")}>
              Already have an account? Sign in
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
