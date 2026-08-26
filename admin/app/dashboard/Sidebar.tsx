"use client";

import { useState } from "react";
import { NavLink } from "./NavLink";
import type { Company, Profile } from "@/lib/types";

/** A section heading in the sidebar. */
function Section({ label }: { label: string }) {
  return (
    <div style={{
      margin: "14px 6px 4px", fontSize: 11, letterSpacing: "0.08em",
      color: "var(--muted)", textTransform: "uppercase",
    }}>
      {label}
    </div>
  );
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
        <h1 style={{ margin: 0, fontSize: 18 }}>📞 SalesAutoCall</h1>
        <button className="mobile-menu-btn" onClick={() => setIsOpen(!isOpen)}>
          {isOpen ? "✕" : "☰"}
        </button>
      </div>
      <aside className={`sidebar ${isOpen ? "mobile-open" : ""}`} onClick={() => setIsOpen(false)}>
        <h1 className="no-print" style={{ display: "none" }}>SalesAutoCall</h1>
        {/* Twenty-eight flat links was the navigation problem — not the number
            of pages, the absence of any grouping. Five sections, ordered by how
            often a working day touches them: act, understand, configure, run
            the platform, diagnose. */}
        <Section label="Operational" />
        {admin && <NavLink href="/dashboard/actions" label="🗂 Action Center" />}
        {admin && <NavLink href="/dashboard/leads" label="🎯 Lead Management" />}
        {/* Admins manage contacts in Lead Management — the read-only Contacts
            list was a duplicate for them; it stays for non-admin viewers. */}
        {profile?.role !== "admin" && <NavLink href="/dashboard/contacts" label="Contacts" />}
        <NavLink href="/dashboard/calls" label="Call logs" />
        <NavLink href="/dashboard/recordings" label="Recordings" />

        <Section label="Analytics" />
        <NavLink href="/dashboard" label="✨ Overview" />
        {admin && <NavLink href="/dashboard/velocity" label="⚡ Sales Velocity" />}
        {admin && <NavLink href="/dashboard/xray" label="🩻 Sales X-Ray" />}
        {profile?.role === "admin" && <NavLink href="/dashboard/reports" label="📊 Reports" />}

        <Section label="Configuration" />
        {admin && <NavLink href="/dashboard/automations" label="⚙️ Automation Center" />}
        {admin && <NavLink href="/dashboard/pulse" label="🔔 Daily Pulse" />}
        {admin && <NavLink href="/dashboard/routing" label="🎯 Lead Routing" />}
        {admin && <NavLink href="/dashboard/whatsapp" label="💬 WhatsApp" />}
        {profile?.role === "admin" && <NavLink href="/dashboard/facebook" label="📱 Facebook Leads" />}
        {admin && <NavLink href="/dashboard/capture" label="🪝 Lead Capture" />}
        {admin && <NavLink href="/dashboard/content" label="📚 Content Library" />}
        {admin && <NavLink href="/dashboard/projects" label="🏢 Buyer Projects" />}
        {admin && <NavLink href="/dashboard/rag" label="🧠 RAG" />}

        <Section label="Team" />
        <NavLink href="/dashboard/salespeople" label="Salespeople" />
        {profile?.role === "admin" && <NavLink href="/dashboard/attendance" label="📅 Attendance" />}
        {admin && <NavLink href="/dashboard/coach" label="🤖 AI Coach" />}
        <NavLink href="/dashboard/apps" label="📲 App downloads" />

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
        {isSuper && <NavLink href="/dashboard/platform/hq" label="🛰 Platform HQ" />}
        {/* Directly under HQ, because the pair is the point: HQ is how busy
            today was, this is what is rotting regardless. A company can look
            fine on HQ every day while never touching most of its book. */}
        {isSuper && <NavLink href="/dashboard/platform/leaks" label="🩸 Where leads are dying" />}
        {isSuper && <NavLink href="/dashboard/platform" label="🏢 Companies" />}
        {isSuper && <NavLink href="/dashboard/platform/telecallers" label="👥 Telecallers · add user" />}
        {isSuper && <NavLink href="/dashboard/platform/contacts" label="📇 Contacts (all)" />}
        {isSuper && <NavLink href="/dashboard/ads" label="📈 Ads Manager" />}
        {isSuper && <NavLink href="/dashboard/platform/storage" label="☁️ Recording storage" />}

        <Section label="Diagnostics" />
        {admin && <NavLink href="/dashboard/health" label="📶 Phone Health" />}
        {admin && <NavLink href="/dashboard/integrity" label="🛡 Integrity check" />}

        <div className="spacer" />
        
        <div style={{ 
          padding: "12px", 
          background: "rgba(255,255,255,0.03)", 
          borderRadius: "12px", 
          border: "1px solid rgba(255,255,255,0.05)",
          marginBottom: "12px",
          display: "flex",
          flexDirection: "column",
          gap: "2px"
        }}>
          <div style={{ color: "#fff", fontWeight: 600, fontSize: "13px" }}>
            {company?.name ?? "No company"}
          </div>
          <div style={{ color: "var(--muted)", fontSize: "12px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
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
