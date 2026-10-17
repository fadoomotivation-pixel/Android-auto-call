import type { Metadata } from "next";
import { SignupForm } from "./SignupForm";
import "./signup.css";

export const metadata: Metadata = {
  title: "Create your free account",
  description:
    "Start Call Pro AI for free. Create your real-estate company with Google or email, invite your telecallers and start calling today.",
  alternates: { canonical: "/signup" },
};

export default function SignupPage() {
  return (
    <main className="su-page">
      <a className="su-brand" href="/"><i aria-hidden />Call Pro AI</a>
      <h1 className="su-h1">Start free</h1>
      <p className="su-lead">Set up your company in 2 minutes. Your telecallers join with your company code.</p>
      <SignupForm />
    </main>
  );
}
