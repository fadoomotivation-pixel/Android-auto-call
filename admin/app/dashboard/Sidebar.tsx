"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { Icon } from "./icons";
import { locate, visibleNav, withCompany, type NavSection } from "@/lib/dashboard/nav";
import type { Company, Profile } from "@/lib/types";
import type { HealthSummary } from "@/lib/dashboard/healthSignals";

/**
 * Ten sections instead of ~37 links. Each section opens its first page; the
 * other pages of that section are tabs at the top of the page (SectionTabs).
 * The rules for who sees what live in lib/dashboard/nav.ts, unchanged from the
 * old flat list.
 */
export function Sidebar({
  profile,
  company,
  email,
  isSuper,
  mobileOpen = false,
  onMobileOpen,
}: {
  profile: Profile | null;
  company: Company | null;
  email: string | undefined;
  isSuper: boolean;
  mobileOpen?: boolean;
  onMobileOpen?: (open: boolean) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const admin = profile?.role === "admin" || isSuper;
  const who = profile?.full_name ?? email ?? company?.name ?? "C";
  const initial = who.trim().charAt(0).toUpperCase() || "C";
  const sections = useMemo(() => visibleNav({ role: profile?.role, isSuper }), [profile?.role, isSuper]);

  useEffect(() => {
    setCollapsed(localStorage.getItem("admin-sidebar") === "collapsed");
    const stored = document.documentElement.getAttribute("data-theme");
    if (stored === "light" || stored === "dark") setTheme(stored);
  }, []);

  function toggleCollapsed(event: MouseEvent) {
    event.stopPropagation();
    setCollapsed((value) => {
      const next = !value;
      localStorage.setItem("admin-sidebar", next ? "collapsed" : "open");
      return next;
    });
  }

  function toggleTheme(event: MouseEvent) {
    event.stopPropagation();
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("admin-theme", next);
  }

  return (
    <aside
      className={`sidebar${collapsed ? " is-collapsed" : ""}${mobileOpen ? " mobile-open" : ""}`}
      onClick={() => onMobileOpen?.(false)}
    >
      <div className="brand-row">
        <div className="brand">
          <span className="brand-mark" aria-hidden>C</span>
          <span className="brand-name">Call Pro AI</span>
        </div>
        <button
          type="button"
          className="icon-btn collapse-btn"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          onClick={toggleCollapsed}
        >
          <Icon name={collapsed ? "menu" : "panel"} />
        </button>
      </div>

      {/* useSearchParams needs a Suspense boundary; the fallback is the same
          list without the ?company= carry, so the nav never flashes empty. */}
      <Suspense fallback={<NavBody sections={sections} admin={admin} company={null} />}>
        <NavWithCompany sections={sections} admin={admin} />
      </Suspense>

      <div className="spacer" />

      <div className="nav-user">
        <div className="avatar" aria-hidden>{initial}</div>
        <div className="nav-user-copy">
          <div className="nav-user-name">{company?.name ?? "No company"}</div>
          <div className="nav-user-meta">{profile?.full_name ?? email}</div>
        </div>
        <button
          type="button"
          className="icon-btn theme-btn"
          aria-label={theme === "light" ? "Use dark mode" : "Use light mode"}
          title={theme === "light" ? "Use dark mode" : "Use light mode"}
          onClick={toggleTheme}
        >
          {theme === "light" ? <MoonIcon /> : <SunIcon />}
        </button>
      </div>

      <form action="/auth/signout" method="post">
        <button className="link" type="submit" title="Sign out">
          <span>Sign out</span>
        </button>
      </form>
    </aside>
  );
}

function NavWithCompany({ sections, admin }: { sections: NavSection[]; admin: boolean }) {
  const company = useSearchParams().get("company");
  return <NavBody sections={sections} admin={admin} company={company} />;
}

function NavBody({
  sections, admin, company,
}: {
  sections: NavSection[];
  admin: boolean;
  company: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const here = locate(pathname, sections);
  const health = useHealth(admin);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  // "/" or Ctrl/Cmd+K jumps to the search box from anywhere.
  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        input.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const words = q.split(/\s+/);
    return sections.flatMap((s) => s.tabs.map((t) => ({ section: s, tab: t })))
      .filter(({ section, tab }) => {
        const hay = `${tab.label} ${section.label} ${tab.hint} ${tab.keywords ?? ""}`.toLowerCase();
        return words.every((w) => hay.includes(w));
      })
      // Name matches first, then section, then hint.
      .sort((a, b) => rank(a.tab.label, q) - rank(b.tab.label, q))
      .slice(0, 8);
  }, [query, sections]);

  useEffect(() => setCursor(0), [query]);

  function go(href: string) {
    setQuery("");
    input.current?.blur();
    router.push(withCompany(href, company));
  }

  function onSearchKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
    else if (e.key === "Enter" && results[cursor]) { e.preventDefault(); go(results[cursor].tab.href); }
    else if (e.key === "Escape") { setQuery(""); input.current?.blur(); }
  }

  return (
    <>
      <div className="nav-search" onClick={(e) => e.stopPropagation()}>
        <SearchIcon />
        <input
          ref={input}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onSearchKey}
          placeholder="Jump to a page"
          aria-label="Jump to a page"
          autoComplete="off"
        />
        {!query && <kbd aria-hidden>/</kbd>}
      </div>

      {query ? (
        <div className="nav-results" role="listbox" aria-label="Pages">
          {results.length === 0 ? (
            <div className="nav-results-empty">No page matches “{query.trim()}”.</div>
          ) : results.map(({ section, tab }, i) => (
            <Link
              key={tab.href}
              href={withCompany(tab.href, company)}
              role="option"
              aria-selected={i === cursor}
              className={`nav-result${i === cursor ? " is-cursor" : ""}`}
              onClick={() => setQuery("")}
              onMouseEnter={() => setCursor(i)}
            >
              <span className="nav-result-label">{tab.label}</span>
              <span className="nav-result-meta">{section.label} · {tab.hint}</span>
            </Link>
          ))}
        </div>
      ) : (
        <nav className="nav-sections" aria-label="Main">
          {sections.map((s) => {
            const active = here?.section.id === s.id;
            const dot = s.id === "health" ? health : null;
            return (
              <Link
                key={s.id}
                href={withCompany(s.tabs[0].href, company)}
                className={active ? "active" : ""}
                title={dot?.title ?? s.label}
                aria-current={active ? "page" : undefined}
              >
                <Icon name={s.icon} className="nav-ico" />
                <span>{s.label}</span>
                {dot && <i className={`nav-dot is-${dot.state}`} aria-label={dot.title} />}
              </Link>
            );
          })}
        </nav>
      )}
    </>
  );
}

function rank(label: string, q: string): number {
  const l = label.toLowerCase();
  if (l.startsWith(q)) return 0;
  if (l.includes(q)) return 1;
  return 2;
}

type Dot = { state: "bad" | "unknown" | "checking"; title: string };

/**
 * The Health dot. Red: something is broken. Grey: we could not check, or are
 * still checking. No dot only after all three signals were read and none is
 * broken — a failed read never turns into "all clear".
 */
function useHealth(admin: boolean): Dot | null {
  const [dot, setDot] = useState<Dot | null>(admin ? { state: "checking", title: "Checking health" } : null);

  useEffect(() => {
    if (!admin) return;
    let alive = true;
    async function check() {
      try {
        const res = await fetch("/api/health-signal", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const h = (await res.json()) as HealthSummary;
        if (!alive) return;
        const broken = h.signals.filter((s) => s.state === "bad");
        if (h.state === "bad") setDot({ state: "bad", title: broken.map((s) => `${s.label}: ${s.line}`).join("\n") });
        else if (h.state === "unknown") setDot({ state: "unknown", title: "Health could not be fully checked. Open Health to see what is unknown." });
        else setDot(null);
      } catch {
        if (alive) setDot({ state: "unknown", title: "Health could not be checked. This is not saying all is well." });
      }
    }
    check();
    const timer = window.setInterval(check, 3 * 60_000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [admin]);

  return dot;
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6 18 18M18 6l-1.4 1.4M7.4 16.6 6 18" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
      <path d="M15.5 3.5a7.5 7.5 0 1 0 5 12.2A8 8 0 0 1 15.5 3.5Z" />
    </svg>
  );
}
