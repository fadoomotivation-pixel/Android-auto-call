"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import "../signup.css";

// After "Continue with Google" a new user has an account but no company yet
// (Google cannot carry the company name). This one screen asks for it and
// calls create_my_company() (migration 0226).
function CompanyForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [companyName, setCompanyName] = useState("");
  const [fullName, setFullName] = useState("");
  const [demo, setDemo] = useState(params.get("demo") !== "0");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.rpc("create_my_company", {
      p_company_name: companyName,
      p_full_name: fullName,
      p_load_demo: demo,
    });
    if (err) {
      setError(/already in a company/i.test(err.message) ? "You already have a company. Opening it…" : err.message);
      setBusy(false);
      if (/already in a company/i.test(err.message)) router.push("/dashboard/actions");
      return;
    }
    router.push("/dashboard/actions");
    router.refresh();
  }

  return (
    <form className="su-card" onSubmit={submit}>
      <div className="su-title">Name your company</div>
      <div className="su-sub">Your telecallers will see this name.</div>
      <input className="su-in" placeholder="Company name" value={companyName} onChange={(e) => setCompanyName(e.target.value)} required />
      <input className="su-in" placeholder="Your name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
      <label className="su-toggle">
        <span>
          <b>Load demo leads</b>
          <small>10 sample leads to try calling. Safe to delete.</small>
        </span>
        <input type="checkbox" checked={demo} onChange={(e) => setDemo(e.target.checked)} />
        <i aria-hidden />
      </label>
      <button className="su-primary" type="submit" disabled={busy}>
        {busy ? "Please wait…" : "Create company"}
      </button>
      {error && <div className="su-error">{error}</div>}
    </form>
  );
}

export default function CompanyPage() {
  return (
    <main className="su-page">
      <a className="su-brand" href="/"><i aria-hidden />Call Pro AI</a>
      <h1 className="su-h1">One last step</h1>
      <p className="su-lead">Tell us your company name and you are in.</p>
      <Suspense>
        <CompanyForm />
      </Suspense>
    </main>
  );
}
