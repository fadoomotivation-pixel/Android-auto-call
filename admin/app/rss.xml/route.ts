import { POSTS } from "@/lib/seo/posts";
import { SITE } from "@/lib/seo/schema";

export const dynamic = "force-static";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function GET() {
  const items = [...POSTS]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((p) => `<item><title>${esc(p.title)}</title><link>${SITE}/blog/${p.slug}</link><guid>${SITE}/blog/${p.slug}</guid><pubDate>${new Date(p.date).toUTCString()}</pubDate><description>${esc(p.description)}</description><category>${esc(p.group)}</category></item>`)
    .join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Call Pro AI blog</title><link>${SITE}/blog</link><description>Practical guides for real-estate telecaller teams.</description><language>en-IN</language>${items}</channel></rss>`;
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
}
