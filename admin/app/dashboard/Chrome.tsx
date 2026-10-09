"use client";

import { usePathname } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { Sidebar } from "./Sidebar";
import { SectionTabs } from "./SectionTabs";
import { DemoBanner } from "./DemoBanner";
import { Icon } from "./icons";
import { locate, visibleNav } from "@/lib/dashboard/nav";
import type { Company, Profile } from "@/lib/types";

/** Longest prefix wins. Words match the page headings, without the emoji. */
const TITLES: [string, string][] = [
  ["/dashboard/platform/telecallers/new", "Create New Telecaller"],
  ["/dashboard/platform/telecallers-activity", "Telecaller activity"],
  ["/dashboard/platform/telecallers", "Telecallers · add user"],
  ["/dashboard/platform/location-interest", "Location demand"],
  ["/dashboard/platform/contacts", "Contacts (all companies)"],
  ["/dashboard/platform/storage", "Recording storage"],
  ["/dashboard/platform/leaks", "Where leads are dying"],
  ["/dashboard/platform/hq", "Platform HQ"],
  ["/dashboard/platform/companies/new", "Create New Company"],
  ["/dashboard/platform", "Companies"],
  ["/dashboard/demo", "Demo account"],
  ["/dashboard/actions", "Action Center"],
  ["/dashboard/leads", "Lead Management"],
  ["/dashboard/calls", "Call logs"],
  ["/dashboard/recordings", "Call recordings"],
  ["/dashboard/velocity", "Sales Velocity"],
  ["/dashboard/xray", "Sales X-Ray"],
  ["/dashboard/reports", "Reports"],
  ["/dashboard/automations", "Automation Center"],
  ["/dashboard/pulse", "Daily Pulse"],
  ["/dashboard/routing", "Lead Routing"],
  ["/dashboard/whatsapp", "WhatsApp"],
  ["/dashboard/facebook", "Facebook Leads"],
  ["/dashboard/capture", "Lead Capture"],
  ["/dashboard/content", "Content Library"],
  ["/dashboard/projects", "Buyer Projects"],
  ["/dashboard/rag", "RAG"],
  ["/dashboard/salespeople", "Salespeople"],
  ["/dashboard/attendance", "Attendance"],
  ["/dashboard/coach", "AI Coach"],
  ["/dashboard/apps", "App downloads"],
  ["/dashboard/health", "Phone Health"],
  ["/dashboard/integrity", "Integrity check"],
  ["/dashboard/ads", "Ads Manager"],
  ["/dashboard/contacts", "Contacts"],
  ["/dashboard", "Overview"],
];

function titleFor(path: string) {
  const hit = TITLES.find(([prefix]) => path === prefix || path.startsWith(prefix + "/"));
  return hit?.[1] ?? "Dashboard";
}

export function Chrome({
  profile,
  company,
  email,
  isSuper,
  children,
}: {
  profile: Profile | null;
  company: Company | null;
  email: string | undefined;
  isSuper: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const companyName = !isSuper ? company?.name ?? null : null;
  const sections = useMemo(() => visibleNav({ role: profile?.role, isSuper }), [profile?.role, isSuper]);
  const here = locate(pathname, sections);
  const pageTitle = titleFor(pathname);
  // The big title is the section; the tabs underneath name the page. A page
  // outside every section (a "new company" form, say) keeps its own title.
  const heading = here?.section.label ?? pageTitle;

  // Browser tab: "Recordings · Call Pro AI", so ten open tabs are tellable apart.
  useEffect(() => {
    document.title = `${pageTitle} · Call Pro AI`;
  }, [pageTitle]);

  return (
    <div className="app">
      <Sidebar
        profile={profile}
        company={company}
        email={email}
        isSuper={isSuper}
        mobileOpen={mobileOpen}
        onMobileOpen={setMobileOpen}
      />
      <div className="content">
        <header className="topbar">
          <div className="topbar-inner">
            <div className="topbar-title">
              <button
                type="button"
                className="icon-btn menu-btn"
                aria-label={mobileOpen ? "Close menu" : "Open menu"}
                onClick={() => setMobileOpen((open) => !open)}
              >
                <Icon name={mobileOpen ? "close" : "menu"} />
              </button>
              <div className="topbar-heading">
                <h1>{heading}</h1>
                {here && <p className="topbar-blurb">{here.section.blurb}</p>}
              </div>
            </div>
            <div className="topbar-tools">
              {companyName && <span className="topbar-company">{companyName}</span>}
              <div id="company-picker-slot" />
            </div>
          </div>
          <Suspense fallback={null}>
            <SectionTabs sections={sections} />
          </Suspense>
        </header>
        <Suspense fallback={null}>
          <DemoBanner />
        </Suspense>
        {children}
      </div>
    </div>
  );
}
