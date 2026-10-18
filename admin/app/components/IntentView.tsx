import { getIntent, INTENTS } from "@/lib/seo/intents";
import { CITIES } from "@/lib/seo/cities";
import { TOOLS } from "@/lib/seo/tools";
import { getPost } from "@/lib/seo/posts";
import { breadcrumb, faqPage, softwareApp, SITE } from "@/lib/seo/schema";
import { JsonLd } from "./JsonLd";
import { SiteShell } from "./SiteShell";

export function IntentView({ slug, hi }: { slug: string; hi: boolean }) {
  const it = getIntent(slug)!;
  const L = hi && it.hi ? it.hi : it;
  const path = hi ? `/hi/${slug}` : `/${slug}`;
  const crumbs = [{ name: hi ? "होम" : "Home", path: "/" }, { name: L.h1, path }];
  const howTo = {
    "@context": "https://schema.org", "@type": "HowTo", name: L.h1, inLanguage: hi ? "hi-IN" : "en-IN",
    step: L.steps.map(([n, t], i) => ({ "@type": "HowToStep", position: i + 1, name: n, text: t, url: `${SITE}${path}#step-${i + 1}` })),
  };
  const others = INTENTS.filter((x) => x.slug !== slug).slice(0, 11);
  return (
    <SiteShell hi={hi}>
      <JsonLd data={breadcrumb(crumbs)} />
      <JsonLd data={faqPage(L.faq)} />
      <JsonLd data={howTo} />
      <JsonLd data={softwareApp(L.description, hi ? "hi-IN" : "en-IN")} />
      <div className="st-crumb">
        <a href="/">{crumbs[0].name}</a> › {L.h1}
        {it.hi && (<>{" · "}<a className="st-lang" href={hi ? `/${slug}` : `/hi/${slug}`} hrefLang={hi ? "en-IN" : "hi-IN"}>{hi ? "Read in English" : "हिंदी में पढ़ें"}</a></>)}
      </div>
      <h1>{L.h1}</h1>
      <p className="st-lead">{L.answer}</p>
      <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
        <a className="st-btn st-btn-lg" href="/signup">{hi ? "अपनी कंपनी फ़्री बनाएँ" : "Create your company free"}</a>
        <a className="st-btn st-btn-lg st-btn-ghost" href="/about">{hi ? "पूरी जानकारी" : "All the facts"}</a>
      </div>

      <h2>{hi ? "कैसे काम करता है" : "How it works"}</h2>
      <div className="st-card st-steps">
        {L.steps.map(([t, d], i) => (<div className="st-row" id={`step-${i + 1}`} key={t}><b>{t}</b><span>{d}</span></div>))}
      </div>

      <h2>{hi ? "क्या मिलता है" : "What you get"}</h2>
      <div className="st-card">{L.does.map((d) => (<div className="st-row" key={d}>{d}</div>))}</div>

      <h2>{hi ? "सीमाएँ, ताकि आपको पता रहे" : "Honest limits"}</h2>
      <div className="st-card">{L.limits.map((d) => (<div className="st-row" key={d}>{d}</div>))}</div>

      <h2>{hi ? "सवाल" : "Questions"}</h2>
      <div className="st-card">{L.faq.map((f) => (<div className="st-row" key={f.q}><b>{f.q}</b><span>{f.a}</span></div>))}</div>

      <h2>{hi ? "फ़्री tools और guides" : "Free tools and guides"}</h2>
      <div className="st-grid">
        {it.tools.map((s) => { const t = TOOLS.find((x) => x.slug === s); return t ? <a className="st-tile" key={s} href={`/tools/${s}`}>{hi ? t.nameHi : t.name}</a> : null; })}
        {it.posts.map((s) => { const p = getPost(s); return p ? <a className="st-tile" key={s} href={`/blog/${s}`}>{p.title}</a> : null; })}
      </div>

      <h2>{hi ? "शहर के हिसाब से" : "By city"}</h2>
      <div className="st-grid">
        {CITIES.slice(0, 8).map((c) => (<a className="st-tile" key={c.slug} href={hi ? `/hi/real-estate-crm/${c.slug}` : `/real-estate-crm/${c.slug}`}>{hi ? c.nameHi : c.name}</a>))}
        <a className="st-tile" href="/real-estate-crm">{hi ? "सभी शहर" : "All cities"}</a>
      </div>

      <h2>{hi ? "और features" : "More features"}</h2>
      <div className="st-grid">
        {others.map((o) => (<a className="st-tile" key={o.slug} href={`/${o.slug}`}>{o.short}</a>))}
      </div>

      <div className="st-cta">
        <h3>{hi ? "हर lead को call करें, फ़्री" : "Call every lead, free"}</h3>
        <p>{hi ? "Call Pro AI रियल एस्टेट टीमों के लिए फ़्री calling CRM है। कोई card नहीं, कोई trial नहीं।" : "Call Pro AI is a free calling CRM for real-estate teams. No card, no trial."}</p>
        <div className="st-row-btns"><a className="st-btn st-btn-lg" href="/signup">{hi ? "फ़्री शुरू करें" : "Start free"}</a></div>
      </div>
    </SiteShell>
  );
}
