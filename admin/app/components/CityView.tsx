import type { City } from "@/lib/seo/cities";
import { cityPage } from "@/lib/seo/cityContent";
import { breadcrumb, faqPage, softwareApp } from "@/lib/seo/schema";
import { JsonLd } from "./JsonLd";
import { SiteShell } from "./SiteShell";
import { TOOLS } from "@/lib/seo/tools";

export function CityView({ city, hi }: { city: City; hi: boolean }) {
  const p = cityPage(city, hi);
  return (
    <SiteShell hi={hi}>
      <JsonLd data={breadcrumb(p.crumbs)} />
      <JsonLd data={faqPage(p.faq)} />
      <JsonLd data={softwareApp(p.description, hi ? "hi-IN" : "en-IN")} />
      <div className="st-crumb">
        {p.crumbs.map((c, i) => (
          <span key={c.path}>{i > 0 && " › "}{i < p.crumbs.length - 1 ? <a href={c.path}>{c.name}</a> : c.name}</span>
        ))}
        {" · "}<a className="st-lang" href={p.other.href} hrefLang={hi ? "en-IN" : "hi-IN"}>{p.other.label}</a>
      </div>
      <h1>{p.h1}</h1>
      <p className="st-lead">{p.lead}</p>
      <div className="row-btns" style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
        <a className="st-btn st-btn-lg" href="/signup">{p.cta}</a>
        <a className="st-btn st-btn-lg st-btn-ghost" href="/about">{hi ? "पूरी जानकारी" : "All the facts"}</a>
      </div>

      <h2>{p.market}</h2>
      <div className="st-card st-pad"><p className="st-p">{p.note}</p><p className="st-p">{p.langLine}</p></div>

      <h2>{p.tipTitle}</h2>
      <div className="st-card st-pad"><p className="st-p">{p.tip}</p></div>

      <h2>{p.stepsTitle}</h2>
      <div className="st-card st-steps">
        {p.steps.map(([t, d]) => (<div className="st-row" key={t}><b>{t}</b><span>{d}</span></div>))}
      </div>

      <h2>{hi ? "सवाल" : "Questions"}</h2>
      <div className="st-card">
        {p.faq.map((f) => (<div className="st-row" key={f.q}><b>{f.q}</b><span>{f.a}</span></div>))}
      </div>

      <h2>{p.nearbyTitle}</h2>
      <div className="st-grid">
        {p.nearby.map((n) => (<a className="st-tile" key={n.href} href={n.href}>{n.label}</a>))}
      </div>

      <h2>{hi ? "फ़्री टूल्स" : "Free tools"}</h2>
      <div className="st-grid">
        {TOOLS.map((t) => (<a className="st-tile" key={t.slug} href={`/tools/${t.slug}`}>{hi ? t.nameHi : t.name}</a>))}
      </div>

      <div className="st-cta">
        <h3>{p.cta}</h3>
        <p>{p.ctaSub}</p>
        <div className="st-row-btns"><a className="st-btn st-btn-lg" href="/signup">{p.cta}</a></div>
      </div>
    </SiteShell>
  );
}
