"use client";

import { useEffect, useState, type MouseEvent } from "react";
import { NavLink } from "./NavLink";
import { Icon } from "./icons";
import type { Company, Profile } from "@/lib/types";

/** A section heading in the sidebar. */
function Section({ label }: { label: string }) {
  return <div className="nav-section">{label}</div>;
}

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
  // Every link repeated this test; it reads better named once.
  const admin = profile?.role === "admin" || isSuper;
  const who = profile?.full_name ?? email ?? company?.name ?? "S";
  const initial = who.trim().charAt(0).toUpperCase() || "S";

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
    <>
      <aside
        className={`sidebar${collapsed ? " is-collapsed" : ""}${mobileOpen ? " mobile-open" : ""}`}
        onClick={() => onMobileOpen?.(false)}
      >
        <div className="brand-row">
          <div className="brand">
            <span className="brand-mark" aria-hidden>S</span>
            <span className="brand-name">SalesAutoCall</span>
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
        {/* Twenty-eight flat links was the navigation problem — not the number
            of pages, the absence of any grouping. Five sections, ordered by how
            often a working day touches them: act, understand, configure, run
            the platform, diagnose. */}
        <Section label="Operational" />
        {admin && <NavLink href="/dashboard/actions" icon="layers" label="Action Center" />}
        {admin && <NavLink href="/dashboard/leads" icon="target" label="Lead Management" />}
        {/* Admins manage contacts in Lead Management — the read-only Contacts
            list was a duplicate for them; it stays for non-admin viewers. */}
        {profile?.role !== "admin" && <NavLink href="/dashboard/contacts" icon="book" label="Contacts" />}
        <NavLink href="/dashboard/calls" icon="phone" label="Call logs" />
        <NavLink href="/dashboard/recordings" icon="mic" label="Recordings" />

        <Section label="Analytics" />
        <NavLink href="/dashboard" icon="grid" label="Overview" />
        {admin && <NavLink href="/dashboard/velocity" icon="zap" label="Sales Velocity" />}
        {admin && <NavLink href="/dashboard/xray" icon="scan" label="Sales X-Ray" />}
        {profile?.role === "admin" && <NavLink href="/dashboard/reports" icon="chart" label="Reports" />}

        <Section label="Configuration" />
        {admin && <NavLink href="/dashboard/automations" icon="sliders" label="Automation Center" />}
        {admin && <NavLink href="/dashboard/pulse" icon="bell" label="Daily Pulse" />}
        {admin && <NavLink href="/dashboard/routing" icon="route" label="Lead Routing" />}
        {admin && <NavLink href="/dashboard/whatsapp" icon="chat" label="WhatsApp" />}
        {profile?.role === "admin" && <NavLink href="/dashboard/facebook" icon="flag" label="Facebook Leads" />}
        {admin && <NavLink href="/dashboard/capture" icon="link" label="Lead Capture" />}
        {admin && <NavLink href="/dashboard/content" icon="library" label="Content Library" />}
        {admin && <NavLink href="/dashboard/projects" icon="building" label="Buyer Projects" />}
        {admin && <NavLink href="/dashboard/rag" icon="spark" label="RAG" />}

        <Section label="Team" />
        <NavLink href="/dashboard/salespeople" icon="users" label="Salespeople" />
        {profile?.role === "admin" && <NavLink href="/dashboard/attendance" icon="calendar" label="Attendance" />}
        {admin && <NavLink href="/dashboard/coach" icon="bot" label="AI Coach" />}
        <NavLink href="/dashboard/apps" icon="download" label="App downloads" />

        {/* THE SECTION THE COMMENT ABOVE PROMISED AND NOBODY BUILT.
            "act, understand, configure, run the platform, diagnose" — four of
            those five became sections; "run the platform" did not, and eight
            working pages were left with no way to reach them. Adding a
            telecaller is one of them: the page and the server action are both
            alive at /platform/telecallers/new, the link simply vanished when
            the sidebar was regrouped, and the only remaining way in was for the
            rep to self-signup with a company code — which is now failing on
            Supabase's email rate limit. The admin path sends no email at all.
            Super admin only: every page here is cross-company by design and
            already hard-gated on platform_admins (Platform HQ on
            is_super_admin() inside its RPCs). */}
        {isSuper && <Section label="Platform" />}
        {isSuper && <NavLink href="/dashboard/platform/hq" icon="radar" label="Platform HQ" />}
        {/* Directly under HQ, because the pair is the point: HQ is how busy
            today was, this is what is rotting regardless. A company can look
            fine on HQ every day while never touching most of its book. */}
        {isSuper && <NavLink href="/dashboard/platform/leaks" icon="alert" label="Where leads are dying" />}
        {/* The people half of the same question. Leaks says which company is
            rotting; this says which person, across every company, and lets you
            read the conversations behind the number. */}
        {isSuper && <NavLink href="/dashboard/platform/telecallers-activity" icon="rows" label="Telecaller activity" />}
        {/* Leaks says a company is rotting; telecaller activity says which rep;
            this says which BUYER, by name, when a new site launches somewhere —
            mined from what they already said on a call or WhatsApp. */}
        {isSuper && <NavLink href="/dashboard/platform/location-interest" icon="pin" label="Location demand" />}
        {isSuper && <NavLink href="/dashboard/platform" icon="building" label="Companies" />}
        {isSuper && <NavLink href="/dashboard/platform/telecallers" icon="userPlus" label="Telecallers · add user" />}
        {isSuper && <NavLink href="/dashboard/platform/contacts" icon="contacts" label="Contacts (all)" />}
        {isSuper && <NavLink href="/dashboard/ads" icon="trending" label="Ads Manager" />}
        {isSuper && <NavLink href="/dashboard/platform/storage" icon="cloud" label="Recording storage" />}

        <Section label="Diagnostics" />
        {admin && <NavLink href="/dashboard/health" icon="pulse" label="Phone Health" />}
        {admin && <NavLink href="/dashboard/integrity" icon="shield" label="Integrity check" />}

        <div className="spacer" />

        <div className="nav-user">
          <div className="avatar" aria-hidden>{initial}</div>
          <div className="nav-user-copy">
            <div className="nav-user-name">
              {company?.name ?? "No company"}
            </div>
            <div className="nav-user-meta">
              {profile?.full_name ?? email}
            </div>
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
    </>
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
