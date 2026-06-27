import type { Metadata } from "next";
import LandingPage from "./landing/LandingPage";

export const metadata: Metadata = {
  title: { absolute: "Call Pro AI — Real Estate Sales, Simplified" },
  description:
    "The AI calling CRM for real-estate teams. Auto-dial leads, record every call, get 10-second hot-lead alerts, and track every plot from enquiry to booking.",
  keywords: [
    "real estate CRM",
    "AI calling CRM",
    "auto dialer for real estate",
    "lead management",
    "Facebook leads",
    "telecaller app",
    "Call Pro AI",
  ],
  alternates: { canonical: "https://callproai.in" },
  openGraph: {
    title: "Call Pro AI — Turn every lead into a booking",
    description:
      "AI calling CRM built for Indian real-estate teams. Auto-dialer, call recordings, instant hot-lead alerts, smart follow-ups, and a clear funnel to booking.",
    url: "https://callproai.in",
    siteName: "Call Pro AI",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Call Pro AI — Turn every lead into a booking",
    description:
      "AI calling CRM for real-estate teams. Auto-dialer, call recordings, instant hot-lead alerts and a clear funnel to booking.",
  },
};

export default function Page() {
  return <LandingPage />;
}
