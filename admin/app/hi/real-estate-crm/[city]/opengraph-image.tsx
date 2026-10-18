import { ogCard } from "@/lib/seo/og";
import { CITIES, getCity } from "@/lib/seo/cities";
// Latin text only: the default OG font has no Devanagari glyphs.
export const alt = "Call Pro AI real-estate CRM (Hindi)";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamicParams = false;
export function generateStaticParams() { return CITIES.map((c) => ({ city: c.slug })); }
export default function Image({ params }: { params: { city: string } }) {
  const c = getCity(params.city)!;
  return ogCard(`Real estate CRM for ${c.name}`, "Hindi guide for property teams", "Free calling CRM, Hindi + English");
}
