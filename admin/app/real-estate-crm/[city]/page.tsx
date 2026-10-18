import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CITIES, getCity } from "@/lib/seo/cities";
import { cityPage } from "@/lib/seo/cityContent";
import { CityView } from "@/app/components/CityView";

export const dynamicParams = false;
export function generateStaticParams() {
  return CITIES.map((c) => ({ city: c.slug }));
}

export function generateMetadata({ params }: { params: { city: string } }): Metadata {
  const c = getCity(params.city);
  if (!c) return {};
  const p = cityPage(c, false);
  return {
    title: { absolute: p.title },
    description: p.description,
    alternates: {
      canonical: `/real-estate-crm/${c.slug}`,
      languages: { "en-IN": `/real-estate-crm/${c.slug}`, "hi-IN": `/hi/real-estate-crm/${c.slug}`, "x-default": `/real-estate-crm/${c.slug}` },
    },
    openGraph: { title: p.title, description: p.description, url: `/real-estate-crm/${c.slug}`, siteName: "Call Pro AI", locale: "en_IN", type: "website" },
  };
}

export default function Page({ params }: { params: { city: string } }) {
  const c = getCity(params.city);
  if (!c) notFound();
  return <CityView city={c} hi={false} />;
}
