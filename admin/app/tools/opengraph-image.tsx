import { ogCard } from "@/lib/seo/og";
export const alt = "Free tools for real-estate teams";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export default function Image() {
  return ogCard("Free tools for property teams", "EMI, lead cost, call scripts and WhatsApp messages");
}
