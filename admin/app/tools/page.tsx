import type { Metadata } from "next";
import { SiteShell } from "@/app/components/SiteShell";
import { JsonLd } from "@/app/components/JsonLd";
import { breadcrumb } from "@/lib/seo/schema";
import { TOOLS } from "@/lib/seo/tools";

export const metadata: Metadata = {
  title: { absolute: "Free tools for real-estate sales teams · Call Pro AI" },
  description: "Free tools for Indian real-estate teams: home loan EMI calculator and Meta lead-cost calculator. No sign-up needed.",
  alternates: { canonical: "/tools" },
};

export default function Tools() {
  return (
    <SiteShell>
      <JsonLd data={breadcrumb([{ name: "Home", path: "/" }, { name: "Free tools", path: "/tools" }])} />
      <div className="st-crumb"><a href="/">Home</a> › Free tools</div>
      <h1>Free tools for real-estate sales teams</h1>
      <p className="st-lead">These tools are free, need no sign-up, and run in your browser.</p>
      <h2>Tools</h2>
      <div className="st-grid">
        {TOOLS.map((t) => (<a className="st-tile" key={t.slug} href={`/tools/${t.slug}`}>{t.name}<span>{t.blurb}</span></a>))}
      </div>
    </SiteShell>
  );
}
