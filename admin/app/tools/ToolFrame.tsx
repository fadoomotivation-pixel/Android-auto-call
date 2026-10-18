import { SiteShell } from "@/app/components/SiteShell";
import { JsonLd } from "@/app/components/JsonLd";
import { breadcrumb, faqPage, SITE } from "@/lib/seo/schema";

export function ToolFrame({
  slug, name, lead, faq, children,
}: { slug: string; name: string; lead: string; faq: { q: string; a: string }[]; children: React.ReactNode }) {
  const crumbs = [{ name: "Home", path: "/" }, { name: "Free tools", path: "/tools" }, { name, path: `/tools/${slug}` }];
  return (
    <SiteShell>
      <JsonLd data={breadcrumb(crumbs)} />
      <JsonLd data={faqPage(faq)} />
      <JsonLd data={{
        "@context": "https://schema.org", "@type": "WebApplication", name, url: `${SITE}/tools/${slug}`,
        applicationCategory: "FinanceApplication", operatingSystem: "Any", isAccessibleForFree: true,
        offers: { "@type": "Offer", price: "0", priceCurrency: "INR" },
        publisher: { "@type": "Organization", name: "Call Pro AI", url: SITE },
      }} />
      <div className="st-crumb"><a href="/">Home</a> › <a href="/tools">Free tools</a> › {name}</div>
      <h1>{name}</h1>
      <p className="st-lead">{lead}</p>
      {children}
      <h2>Questions</h2>
      <div className="st-card">
        {faq.map((f) => (<div className="st-row" key={f.q}><b>{f.q}</b><span>{f.a}</span></div>))}
      </div>
      <div className="st-cta">
        <h3>Call every lead, free</h3>
        <p>Call Pro AI is a free calling CRM for real-estate teams. Leads land in Call now and the Android auto-dialer calls them.</p>
        <div className="st-row-btns"><a className="st-btn st-btn-lg" href="/signup">Create your company free</a></div>
      </div>
    </SiteShell>
  );
}
