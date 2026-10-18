import type { Metadata } from "next";
import { CITIES } from "@/lib/seo/cities";
import { SiteShell } from "@/app/components/SiteShell";
import { JsonLd } from "@/app/components/JsonLd";
import { breadcrumb } from "@/lib/seo/schema";

export const metadata: Metadata = {
  title: { absolute: "Real Estate CRM by city: free calling CRM for Indian teams · Call Pro AI" },
  description: "Call Pro AI is a free calling CRM for real-estate telecaller teams across India. Pick your city to see how teams there use it, in English or Hindi.",
  alternates: { canonical: "/real-estate-crm" },
};

export default function Cities() {
  return (
    <SiteShell>
      <JsonLd data={breadcrumb([{ name: "Home", path: "/" }, { name: "Real estate CRM", path: "/real-estate-crm" }])} />
      <div className="st-crumb"><a href="/">Home</a> › Real estate CRM</div>
      <h1>Real estate CRM by city</h1>
      <p className="st-lead">Call Pro AI is a free calling CRM for real-estate telecaller teams across India. Pick your city.</p>
      <h2>Cities</h2>
      <div className="st-grid">
        {CITIES.map((c) => (
          <div className="st-tile" key={c.slug}>
            <a href={`/real-estate-crm/${c.slug}`}>{c.name}</a>
            <span>{c.state} · <a href={`/hi/real-estate-crm/${c.slug}`} className="st-lang">हिंदी</a></span>
          </div>
        ))}
      </div>
    </SiteShell>
  );
}
