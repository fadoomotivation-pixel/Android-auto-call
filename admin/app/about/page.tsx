import type { Metadata } from "next";
import { FAQ, faqJsonLd } from "@/lib/seo/faq";
import { JsonLd } from "@/app/components/JsonLd";
import "./about.css";

// A plain fact page about Call Pro AI that people and AI assistants can quote.
// Answer-first sentences, only what is true in this repo, no competitor names,
// no unmeasured numbers. Update the "facts checked" date when a fact changes.
const CHECKED = "18 October 2026";

export const metadata: Metadata = {
  title: "About Call Pro AI: free calling CRM for real-estate teams",
  description:
    "Call Pro AI is a free calling CRM for Indian real-estate teams: Android auto-dialer, call recording with AI coaching, Meta lead sync, Follow Ups, Scan list, attendance and GPS site visits.",
  alternates: { canonical: "/about" },
};

const FEATURES: [string, string][] = [
  ["Auto-dialer", "The Android app calls the next lead in the Call now list, one after another, on the telecaller's own SIM."],
  ["Lead buckets", "Leads sit in Call now, Scheduled or Win back, so the telecaller always knows whom to call next."],
  ["Follow Ups", "Callbacks are grouped as Overdue, Today and Upcoming, with one pending follow-up per lead."],
  ["Call recording and AI coach", "Calls are recorded on phones that allow it; an AI writes a short summary and a coaching tip after the call."],
  ["Meta lead sync", "Facebook and Instagram lead-form leads are pulled in automatically, and site visits and bookings can be sent back to Meta."],
  ["Scan list", "A photo of a printed or handwritten list becomes leads. The text is read on the phone, with nothing uploaded."],
  ["Attendance and GPS site visits", "Telecallers check in for the day, and site visits are verified with the phone's location."],
  ["WhatsApp", "Message templates and one-tap WhatsApp to the buyer from the lead."],
  ["Owner dashboard", "Calls, connects, follow-ups, site visits and bookings per telecaller, on the web."],
  ["Daily report", "A short evening summary of the team's day for the owner."],
];

const ORG = {
  "@context": "https://schema.org",
  "@type": "AboutPage",
  url: "https://callproai.in/about",
  name: "About Call Pro AI",
  about: {
    "@type": "SoftwareApplication",
    name: "Call Pro AI",
    url: "https://callproai.in",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Android, Web",
    offers: { "@type": "Offer", price: "0", priceCurrency: "INR" },
  },
  dateModified: "2026-10-18",
};

export default function AboutPage() {
  return (
    <main className="ab">
      <JsonLd data={ORG} />
      <JsonLd data={faqJsonLd()} />
      <div className="ab-wrap">
        <nav className="ab-nav">
          <a className="ab-brand" href="/"><i aria-hidden />Call Pro AI</a>
          <a className="ab-cta" href="/signup">Start free</a>
        </nav>

        <h1>About Call Pro AI</h1>
        <p className="ab-lead">
          Call Pro AI is a free calling CRM for Indian real-estate teams. Telecallers call leads
          from an Android app with an auto-dialer, and the owner sees calls, follow-ups, site
          visits and bookings on a web dashboard.
        </p>
        <div className="ab-sub">Facts checked on {CHECKED}.</div>

        <h2>Key facts</h2>
        <div className="ab-card">
          {[
            ["Name", "Call Pro AI"],
            ["Website", "callproai.in"],
            ["Category", "Calling CRM for real estate"],
            ["Price", "Free (₹0). No card, no trial period"],
            ["Made for", "Builders, developers and brokers in India with telecallers"],
            ["Telecaller app", "Android"],
            ["Owner app", "Web dashboard, any browser"],
            ["Sign up", "Google or email at callproai.in/signup"],
            ["Contact", "admin@callproai.in"],
          ].map(([k, v]) => (
            <div className="ab-row ab-kv" key={k}><b>{k}</b><span>{v}</span></div>
          ))}
        </div>

        <h2>What it does</h2>
        <div className="ab-card">
          {FEATURES.map(([t, d]) => (
            <div className="ab-row" key={t}><b>{t}</b><span>{d}</span></div>
          ))}
        </div>

        <h2>Who uses it</h2>
        <div className="ab-card">
          <div className="ab-row"><b>Owner or admin</b><span>Creates the company, shares the company code, sees the dashboard and reports.</span></div>
          <div className="ab-row"><b>Telecaller</b><span>Joins with the company code in the Android app and calls the leads given to them.</span></div>
        </div>

        <h2>Limits, so you know</h2>
        <div className="ab-card">
          <div className="ab-row">The auto-dialer and call recording work in the Android app only. There is no iPhone app for telecallers yet.</div>
          <div className="ab-row">Call recording depends on the phone model allowing it.</div>
        </div>

        <h2>Questions</h2>
        <div className="ab-card">
          {FAQ.map((f) => (
            <div className="ab-row" key={f.q}><div className="ab-q">{f.q}</div><span>{f.a}</span></div>
          ))}
        </div>

        <div className="ab-foot">
          Contact <a className="ab-link" href="mailto:admin@callproai.in">admin@callproai.in</a> ·{" "}
          <a className="ab-link" href="/signup">Create a free account</a> · <a className="ab-link" href="/privacy">Privacy</a>
        </div>
      </div>
    </main>
  );
}
