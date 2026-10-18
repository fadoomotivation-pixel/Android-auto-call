import { ogCard } from "@/lib/seo/og";
import { getIntent } from "@/lib/seo/intents";
export const alt = "Call Pro AI";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export default function Image() {
  const it = getIntent("real-estate-crm-for-brokers")!;
  return ogCard(it.h1, "Free calling CRM for Indian real-estate teams");
}
