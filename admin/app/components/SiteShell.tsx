import "./site.css";
import { CITIES } from "@/lib/seo/cities";

// Shared nav + footer for the public SEO pages. The footer links every city
// page so search engines and people can reach all of them in one click.
export function SiteShell({ children, hi = false }: { children: React.ReactNode; hi?: boolean }) {
  return (
    <div className="st" lang={hi ? "hi-IN" : "en-IN"}>
      <nav className="st-nav">
        <div className="st-nav-in">
          <a className="st-brand" href="/"><i aria-hidden />Call Pro AI</a>
          <div className="st-links">
            <a href="/real-estate-crm">{hi ? "शहर" : "Cities"}</a>
            <a href="/about">{hi ? "हमारे बारे में" : "About"}</a>
            <a className="st-btn" href="/signup">{hi ? "फ़्री शुरू करें" : "Start free"}</a>
          </div>
        </div>
      </nav>
      <div className="st-wrap">
        {children}
        <footer className="st-foot">
          <div className="st-foot-cols">
            {CITIES.map((c) => (
              <a key={c.slug} href={hi ? `/hi/real-estate-crm/${c.slug}` : `/real-estate-crm/${c.slug}`}>
                {hi ? `${c.nameHi} रियल एस्टेट CRM` : `Real estate CRM ${c.name}`}
              </a>
            ))}
          </div>
          <div>
            Call Pro AI · free calling CRM for real estate · <a href="mailto:admin@callproai.in">admin@callproai.in</a> ·{" "}
            <a href="/about">About</a> · <a href="/privacy">Privacy</a>
          </div>
        </footer>
      </div>
    </div>
  );
}
