"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { Sidebar } from "./Sidebar";
import { Icon } from "./icons";
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
  ["/dashboard", "Command center"],
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
              <h1>{titleFor(pathname)}</h1>
            </div>
            <div className="topbar-tools">
              {companyName && <span className="topbar-company">{companyName}</span>}
              <div id="company-picker-slot" />
            </div>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
