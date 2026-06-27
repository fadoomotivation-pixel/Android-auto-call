import type { Metadata } from "next";
import Landing from "./Landing";

export const metadata: Metadata = {
  title: { absolute: "Call Pro AI — Real Estate Sales, Simplified" },
  description:
    "The AI calling CRM for real-estate teams. Auto-dial leads, record every call, get 10-second hot-lead alerts, and track every plot from enquiry to booking.",
  openGraph: {
    title: "Call Pro AI — Turn every lead into a booking",
    description:
      "AI calling CRM built for Indian real-estate teams. Auto-dialer, call recordings, instant hot-lead alerts, smart follow-ups, and a clear funnel to booking.",
    type: "website",
  },
};

export default function Page() {
  return <Landing />;
}
