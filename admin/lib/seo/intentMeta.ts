import type { Metadata } from "next";
import { getIntent } from "./intents";

export function intentMetadata(slug: string, hi: boolean): Metadata {
  const it = getIntent(slug)!;
  const L = hi && it.hi ? it.hi : it;
  const path = hi ? `/hi/${slug}` : `/${slug}`;
  const languages: Record<string, string> = it.hi
    ? { "en-IN": `/${slug}`, "hi-IN": `/hi/${slug}`, "x-default": `/${slug}` }
    : { "en-IN": `/${slug}`, "x-default": `/${slug}` };
  return {
    title: { absolute: L.title },
    description: L.description,
    alternates: { canonical: path, languages },
    openGraph: { title: L.title, description: L.description, url: path, siteName: "Call Pro AI", locale: hi ? "hi_IN" : "en_IN", type: "website" },
  };
}
