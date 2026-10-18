// One FAQ list, shown on the landing page and /about and emitted as FAQPage
// JSON-LD on both. Google wants the markup to match what the page shows, so
// the visible FAQ and the schema always come from this one array.
// Only facts that are true in this repo. No competitor names, no unmeasured stats.
export const FAQ = [
  {
    q: "What is Call Pro AI?",
    a: "Call Pro AI is a free calling CRM for Indian real-estate teams. Telecallers call leads from an Android app with an auto-dialer, and the owner sees calls, follow-ups, site visits and bookings on a web dashboard.",
  },
  {
    q: "Is Call Pro AI free?",
    a: "Yes. Call Pro AI is free to use, with no card and no trial period. You create your company at callproai.in/signup with Google or email.",
  },
  {
    q: "Who is Call Pro AI for?",
    a: "Builders, developers and brokers in India who have telecallers calling property leads, such as plots, flats and villas.",
  },
  {
    q: "Where do the leads come from?",
    a: "Facebook and Instagram lead forms sync in automatically, website forms can send leads in, and you can import an Excel or CSV file or scan a printed list with the phone camera.",
  },
  {
    q: "Does it record calls?",
    a: "Yes. The Android app records SIM calls on phones that allow it and uploads them, and an AI writes a short summary and a coaching tip after the call.",
  },
  {
    q: "Do my telecallers need an iPhone or a special SIM?",
    a: "No. Telecallers use the Android app on their own phone and SIM. Owners and managers use the web dashboard in any browser.",
  },
  {
    q: "How do telecallers join?",
    a: "The owner shares the company code from the dashboard. A telecaller installs the Android app, signs up and enters the code to join that company.",
  },
  {
    q: "How do I contact Call Pro AI?",
    a: "Email admin@callproai.in.",
  },
] as const;

export function faqJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}
