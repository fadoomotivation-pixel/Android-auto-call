import { ogCard } from "@/lib/seo/og";
export const alt = "Call Pro AI, the free calling CRM for real-estate teams";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export default function Image() {
  return ogCard("Call every lead. Book more site visits.", "Leads, auto-dialer and follow-ups for property teams");
}
