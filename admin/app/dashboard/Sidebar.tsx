"use client";

import { useState } from "react";
import { NavLink } from "./NavLink";
import type { Company, Profile } from "@/lib/types";

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

  return (
    <>
      <div className="mobile-topbar">
        <h1 style={{ margin: 0, fontSize: 18 }}>📞 SalesAutoCall</h1>
        <button className="mobile-menu-btn" onClick={() => setIsOpen(!isOpen)}>
          {isOpen ? "✕" : "☰"}
        </button>
      </div>
      <aside className={`sidebar ${isOpen ? "mobile-open" : ""}`} onClick={() => setIsOpen(false)}>
        <h1 className="no-print" style={{ display: "none" }}>📞 SalesAutoCall</h1>
        <NavLink href="/dashboard" label="Overview" />
        {(profile?.role === "admin" || isSuper) && <NavLink href="/dashboard/coach" label="🤖 AI Coach" />}
        <NavLink href="/dashboard/salespeople" label="Salespeople" />
        {profile?.role === "admin" && <NavLink href="/dashboard/attendance" label="📅 Attendance" />}
        {profile?.role === "admin" && <NavLink href="/dashboard/leads" label="🎯 Lead Management" />}
        {profile?.role === "admin" && <NavLink href="/dashboard/cloud-calling" label="☁️ Cloud calling" />}
        {(profile?.role === "admin" || isSuper) && <NavLink href="/dashboard/whatsapp" label="💬 WhatsApp" />}
        {profile?.role === "admin" && <NavLink href="/dashboard/facebook" label="📱 Facebook Leads" />}
        {(profile?.role === "admin" || isSuper) && <NavLink href="/dashboard/capture" label="🪝 Lead Capture" />}
        <NavLink href="/dashboard/contacts" label="Contacts" />
        <NavLink href="/dashboard/calls" label="Call logs" />
        <NavLink href="/dashboard/recordings" label="Recordings" />
        {profile?.role === "admin" && <NavLink href="/dashboard/reports" label="📊 Reports" />}
        
        {isSuper && (
          <>
            <div style={{ margin: "14px 6px 4px", fontSize: 11, letterSpacing: "0.08em", color: "var(--muted)", textTransform: "uppercase" }}>
              Super admin
            </div>
            <NavLink href="/dashboard/platform" label="🏢 Companies" />
            <NavLink href="/dashboard/platform/telecallers" label="🎧 Telecallers" />
            <NavLink href="/dashboard/platform/contacts" label="📇 Contacts" />
            <NavLink href="/dashboard/platform/integrations" label="☎️ Integrations" />
            <NavLink href="/dashboard/platform/storage" label="💾 Recording storage" />
          </>
        )}
        
        <div className="spacer" />
        
        <div style={{ padding: "0 6px 10px", color: "var(--muted)", fontSize: 12 }}>
          <div style={{ color: "var(--text)", fontWeight: 600 }}>
            {company?.name ?? "No company"}
          </div>
          <div>{profile?.full_name ?? email}</div>
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
