import type { Metadata } from "next";
import LandingPage from "./landing/LandingPage";
import { faqJsonLd } from "@/lib/seo/faq";

export const metadata: Metadata = {
  title: { absolute: "Call Pro AI — Free Calling CRM for Real Estate Teams" },
  description:
    "Free calling CRM for Indian real-estate teams. Auto-dialer, Call now queue, follow-ups, Scan list, AI coach, attendance and Meta lead sync. Sign up with Google or email.",
  keywords: [
    "real estate CRM",
    "AI calling CRM",
    "auto dialer for real estate",
    "lead management",
    "Facebook leads",
    "telecaller app",
    "free real estate CRM",
    "CRM for builders",
    "Call Pro AI",
  ],
  alternates: { canonical: "https://callproai.in", languages: { "en-IN": "https://callproai.in", "x-default": "https://callproai.in" } },
  openGraph: {
    title: "Call Pro AI — Free calling CRM for real estate",
    description:
      "AI calling CRM built for Indian real-estate teams. Auto-dialer, call recordings, instant hot-lead alerts, smart follow-ups, and a clear funnel to booking.",
    url: "https://callproai.in",
    siteName: "Call Pro AI",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Call Pro AI — Free calling CRM for real estate",
    description:
      "AI calling CRM for real-estate teams. Auto-dialer, call recordings, instant hot-lead alerts and a clear funnel to booking.",
  },
};

const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://callproai.in/#org",
      name: "Call Pro AI",
      url: "https://callproai.in",
      email: "admin@callproai.in",
      areaServed: "IN",
    },
    {
      "@type": "SoftwareApplication",
      name: "Call Pro AI",
      url: "https://callproai.in",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Android, Web",
      inLanguage: "en-IN",
      publisher: { "@id": "https://callproai.in/#org" },
      offers: { "@type": "Offer", price: "0", priceCurrency: "INR" },
      description:
        "Free calling CRM for real-estate telecaller teams: auto-dialer, follow-ups, Scan list, AI coach, attendance and Meta lead sync.",
    },
  ],
};

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd()) }}
      />
      <LandingPage />
    </>
  );
}
