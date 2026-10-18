import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteShell } from "@/app/components/SiteShell";
import { JsonLd } from "@/app/components/JsonLd";
import { breadcrumb, SITE } from "@/lib/seo/schema";
import { POSTS, getPost } from "@/lib/seo/posts";

export const dynamicParams = false;
export function generateStaticParams() {
  return POSTS.map((p) => ({ slug: p.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const p = getPost(params.slug);
  if (!p) return {};
  return {
    title: { absolute: `${p.title} · Call Pro AI` },
    description: p.description,
    alternates: { canonical: `/blog/${p.slug}` },
    openGraph: { title: p.title, description: p.description, url: `/blog/${p.slug}`, type: "article", publishedTime: p.date, siteName: "Call Pro AI" },
  };
}

export default function PostPage({ params }: { params: { slug: string } }) {
  const p = getPost(params.slug);
  if (!p) notFound();
  const related = p.related.map(getPost).filter(Boolean);
  return (
    <SiteShell>
      <JsonLd data={breadcrumb([{ name: "Home", path: "/" }, { name: "Blog", path: "/blog" }, { name: p.title, path: `/blog/${p.slug}` }])} />
      <JsonLd data={{
        "@context": "https://schema.org", "@type": "Article", headline: p.title, description: p.description,
        datePublished: p.date, dateModified: p.date, inLanguage: "en-IN", mainEntityOfPage: `${SITE}/blog/${p.slug}`,
        author: { "@type": "Organization", name: "Call Pro AI", url: SITE },
        publisher: { "@type": "Organization", name: "Call Pro AI", url: SITE },
      }} />
      <div className="st-crumb"><a href="/">Home</a> › <a href="/blog">Blog</a> › {p.group}</div>
      <h1>{p.title}</h1>
      <div className="st-sub">{p.group} · {p.minutes} min read · {new Date(p.date).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</div>
      <article className="st-card st-pad" style={{ marginTop: 16 }}>
        {p.sections.map((s, i) => (
          <section key={i} style={{ marginTop: i ? 16 : 0 }}>
            {s.h && <h3>{s.h}</h3>}
            {s.p?.map((t, j) => <p className="st-p" key={j}>{t}</p>)}
            {s.list && <ul className="st-p" style={{ paddingLeft: 20, margin: "0 0 12px" }}>{s.list.map((t, j) => <li key={j}>{t}</li>)}</ul>}
          </section>
        ))}
      </article>
      <h2>Read next</h2>
      <div className="st-grid">
        {related.map((r) => r && (<a className="st-tile" key={r.slug} href={`/blog/${r.slug}`}>{r.title}</a>))}
        <a className="st-tile" href="/tools">Free tools<span>EMI and Meta lead-cost calculators</span></a>
      </div>
      <div className="st-cta">
        <h3>Try it free</h3>
        <p>Call Pro AI is a free calling CRM for real-estate teams. No card, no trial.</p>
        <div className="st-row-btns"><a className="st-btn st-btn-lg" href="/signup">Create your company free</a></div>
      </div>
    </SiteShell>
  );
}
