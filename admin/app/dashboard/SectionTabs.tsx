"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { locate, withCompany, type NavSection } from "@/lib/dashboard/nav";

/**
 * The pages of the current section, as tabs under the title. Each tab is the
 * existing page at its existing URL, so nothing moved — only the way in.
 * Carries ?company= so a super admin looking at one company stays on it.
 */
export function SectionTabs({ sections }: { sections: NavSection[] }) {
  const pathname = usePathname();
  const company = useSearchParams().get("company");
  const here = locate(pathname, sections);
  if (!here || here.section.tabs.length < 2) return null;

  return (
    <nav className="section-tabs" aria-label={`${here.section.label} pages`}>
      {here.section.tabs.map((t) => {
        const active = t.href === here.tab.href;
        return (
          <Link
            key={t.href}
            href={withCompany(t.href, company)}
            className={`section-tab${active ? " is-active" : ""}`}
            aria-current={active ? "page" : undefined}
            title={t.hint}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
