"use client";

import { useState } from "react";
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
  isSuper
}: {
  profile: Profile | null;
  company: Company | null;
  email: string | undefined;
  isSuper: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  // Every link repeated this test; it reads better named once.
  const admin = profile?.role === "admin" || isSuper;

  return (
    <>
      <div className="mobile-topbar">
        <h1 style={{ margin: 0, fontSize: 17 }}>SalesAutoCall</h1>
        <button
          className="mobile-menu-btn"
          aria-label={isOpen ? "Close menu" : "Open menu"}
          onClick={() => setIsOpen(!isOpen)}
        >
          <Icon name={isOpen ? "close" : "menu"} />
        </button>
      </div>
      <aside className={`sidebar ${isOpen ? "mobile-open" : ""}`} onClick={() => setIsOpen(false)}>
        <div className="brand">SalesAutoCall</div>
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
          <div className="nav-user-name">
            {company?.name ?? "No company"}
          </div>
          <div className="nav-user-meta">
            {profile?.full_name ?? email}
          </div>
        </div>

        <form action="/auth/signout" method="post">
          <button className="link" type="submit">
            Sign out
          </button>
        </form>
      </aside>
    </>
  );
}
