export const SITE = "https://callproai.in";

export function breadcrumb(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: SITE + it.path })),
  };
}

export function faqPage(faq: { q: string; a: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
}

export function softwareApp(description: string, inLanguage = "en-IN") {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Call Pro AI",
    url: SITE,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Android, Web",
    inLanguage,
    offers: { "@type": "Offer", price: "0", priceCurrency: "INR" },
    description,
  };
}
