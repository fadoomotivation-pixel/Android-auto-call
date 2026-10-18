import { ogCard } from "@/lib/seo/og";
import { getIntent } from "@/lib/seo/intents";
import { HI_INTENT_SLUGS } from "@/lib/seo/intentSlugs";
// Latin text only: the default OG font has no Devanagari glyphs.
export const alt = "Call Pro AI (Hindi)";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamicParams = false;
export function generateStaticParams() { return HI_INTENT_SLUGS.map((intent) => ({ intent })); }
export default function Image({ params }: { params: { intent: string } }) {
  return ogCard(getIntent(params.intent)!.h1, "Hindi guide for property teams", "Free calling CRM, Hindi + English");
}
