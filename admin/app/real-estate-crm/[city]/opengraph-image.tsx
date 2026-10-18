import { ogCard } from "@/lib/seo/og";
import { CITIES, getCity } from "@/lib/seo/cities";
export const alt = "Call Pro AI real-estate CRM";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamicParams = false;
export function generateStaticParams() { return CITIES.map((c) => ({ city: c.slug })); }
export default function Image({ params }: { params: { city: string } }) {
  const c = getCity(params.city)!;
  return ogCard(`Real estate CRM for ${c.name} teams`, `Call Meta leads fast and book site visits in ${c.name}, ${c.state}`);
}
