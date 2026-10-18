import type { MetadataRoute } from "next";
import { CITIES } from "@/lib/seo/cities";
import { TOOLS } from "@/lib/seo/tools";

const BASE = "https://callproai.in";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${BASE}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${BASE}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/signup`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${BASE}/login`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${BASE}/real-estate-crm`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE}/tools`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    ...TOOLS.map((t) => ({ url: `${BASE}/tools/${t.slug}`, lastModified: now, changeFrequency: "monthly" as const, priority: 0.7 })),
    ...CITIES.flatMap((c) => [
      {
        url: `${BASE}/real-estate-crm/${c.slug}`, lastModified: now, changeFrequency: "monthly" as const, priority: 0.7,
        alternates: { languages: { "en-IN": `${BASE}/real-estate-crm/${c.slug}`, "hi-IN": `${BASE}/hi/real-estate-crm/${c.slug}` } },
      },
      {
        url: `${BASE}/hi/real-estate-crm/${c.slug}`, lastModified: now, changeFrequency: "monthly" as const, priority: 0.6,
        alternates: { languages: { "en-IN": `${BASE}/real-estate-crm/${c.slug}`, "hi-IN": `${BASE}/hi/real-estate-crm/${c.slug}` } },
      },
    ]),
  ];
}
