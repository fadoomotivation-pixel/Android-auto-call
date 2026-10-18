import type { Metadata } from "next";
import { ToolFrame } from "../ToolFrame";
import { LeadCostCalculator } from "./LeadCost";

export const metadata: Metadata = {
  title: { absolute: "Meta Lead Cost Calculator for Real Estate (free) · Call Pro AI" },
  description: "Free calculator for real-estate Meta ads: enter ad spend, leads, site visits and bookings to see cost per lead, cost per site visit and cost per booking.",
  alternates: { canonical: "/tools/meta-lead-cost-calculator" },
};

const FAQ = [
  { q: "Which number matters most?", a: "Cost per booking. A cheap lead that never visits the site costs more in the end than a pricier lead that books." },
  { q: "Where do I get these numbers?", a: "Ad spend and leads are in Meta Ads Manager. Site visits and bookings come from your CRM, where each lead's stage is recorded." },
  { q: "How do I lower cost per booking?", a: "Call new leads the same day, follow up on every callback, and send site visits and bookings back to Meta so it can find more buyers like them. Call Pro AI does the last part with Meta's Conversions API." },
];

export default function Page() {
  return (
    <ToolFrame slug="meta-lead-cost-calculator" name="Meta lead-cost calculator" lead="This free calculator turns your Meta ad spend into cost per lead, cost per site visit and cost per booking. It runs in your browser, and nothing you type is sent anywhere." faq={FAQ}>
      <LeadCostCalculator />
    </ToolFrame>
  );
}
