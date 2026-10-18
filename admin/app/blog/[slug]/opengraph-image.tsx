import { ogCard } from "@/lib/seo/og";
import { POSTS } from "@/lib/seo/posts";
export const alt = "Call Pro AI blog";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamicParams = false;
export function generateStaticParams() { return POSTS.map((p) => ({ slug: p.slug })); }
export default function Image({ params }: { params: { slug: string } }) {
  const p = POSTS.find((x) => x.slug === params.slug)!;
  return ogCard(p.title, "Call Pro AI blog", "Practical guides for property telecallers");
}
