import type { Metadata } from "next";
import { SiteShell } from "@/app/components/SiteShell";
import { JsonLd } from "@/app/components/JsonLd";
import { breadcrumb } from "@/lib/seo/schema";
import { GROUPS, POSTS } from "@/lib/seo/posts";

export const metadata: Metadata = {
  title: { absolute: "Blog: real-estate telecalling, Meta leads and site visits · Call Pro AI" },
  description: "Practical guides for Indian real-estate telecaller teams: calling Meta leads, daily routines, buyer objections, site visits and Scan list.",
  alternates: { canonical: "/blog", types: { "application/rss+xml": "/rss.xml" } },
};

export default function Blog() {
  return (
    <SiteShell>
      <JsonLd data={breadcrumb([{ name: "Home", path: "/" }, { name: "Blog", path: "/blog" }])} />
      <div className="st-crumb"><a href="/">Home</a> › Blog · <a className="st-lang" href="/rss.xml">RSS</a></div>
      <h1>Blog</h1>
      <p className="st-lead">Practical guides for real-estate telecaller teams, in simple words.</p>
      {GROUPS.map((g) => (
        <div key={g}>
          <h2>{g}</h2>
          <div className="st-card">
            {POSTS.filter((p) => p.group === g).map((p) => (
              <a className="st-row" style={{ display: "block" }} key={p.slug} href={`/blog/${p.slug}`}>
                <b>{p.title}</b><span>{p.description}</span>
              </a>
            ))}
          </div>
        </div>
      ))}
    </SiteShell>
  );
}
