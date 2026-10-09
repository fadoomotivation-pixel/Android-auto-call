/**
 * The ten places in the admin, and the pages that live inside each one.
 *
 * The sidebar had grown to about 37 flat links. Nothing was wrong with any one
 * page; the founder simply could not hold 37 names in their head. So pages that
 * answer the same kind of question now sit together as tabs of one section.
 *
 * NO PAGE WAS REMOVED AND NO URL CHANGED. Every tab is the existing page at its
 * existing address, so bookmarks, links inside pages, and `?company=` all keep
 * working. Who can see a tab is exactly who could see the old link.
 *
 * Adding a page: add a tab to the section it belongs to. If it fits none of the
 * ten, that is a question for the founder, not a new section.
 */
import type { IconName } from "@/app/dashboard/icons";

/**
 * Who may see a tab. These are the old sidebar's rules, kept one for one.
 *
 *  all       — everyone signed in, telecallers included
 *  admin     — company admin or super admin
 *  roleAdmin — profile.role === "admin" (the old `profile?.role === "admin"`)
 *  nonAdmin  — profile.role !== "admin" (the read-only Contacts list)
 *  super     — platform super admin only
 */
export type Audience = "all" | "admin" | "roleAdmin" | "nonAdmin" | "super";

export type NavTab = {
  href: string;
  label: string;
  /** One short line, shown in search results. */
  hint: string;
  who: Audience;
  /** Extra words the quick search should match. */
  keywords?: string;
};

export type NavSection = {
  id: string;
  label: string;
  icon: IconName;
  /** One short line under the section title. */
  blurb: string;
  tabs: NavTab[];
};

export const NAV: NavSection[] = [
  {
    id: "today", label: "Today", icon: "grid",
    blurb: "Money, bookings and what needs you right now.",
    tabs: [
      { href: "/dashboard", label: "Overview", hint: "Money card, calls and who is ahead", who: "all", keywords: "home command center money spend bookings" },
      { href: "/dashboard/actions", label: "Action Center", hint: "What a person must do right now", who: "admin", keywords: "todo alerts stuck" },
      { href: "/dashboard/pulse", label: "Daily Pulse", hint: "What each telecaller did today", who: "admin", keywords: "report 7pm founder" },
      { href: "/dashboard/demo", label: "Demo account", hint: "Show Call Pro AI on a made-up builder", who: "super", keywords: "demo present pitch sales example sample" },
    ],
  },
  {
    id: "leads", label: "Leads", icon: "target",
    blurb: "Every lead, where it came from and who gets it.",
    tabs: [
      { href: "/dashboard/leads", label: "Lead Management", hint: "Search, assign and import leads", who: "admin", keywords: "import excel assign stage" },
      { href: "/dashboard/contacts", label: "Contacts", hint: "Read-only list of your contacts", who: "nonAdmin" },
      { href: "/dashboard/platform/contacts", label: "Contacts (all)", hint: "Every company's contacts", who: "super", keywords: "all companies" },
      { href: "/dashboard/routing", label: "Lead Routing", hint: "Who gets each new lead", who: "admin", keywords: "round robin assign" },
      { href: "/dashboard/capture", label: "Lead Capture", hint: "Website and form links that create leads", who: "admin", keywords: "webhook form website" },
      { href: "/dashboard/facebook", label: "Facebook Leads", hint: "Meta lead forms and where they go", who: "roleAdmin", keywords: "meta form" },
    ],
  },
  {
    id: "calls", label: "Calls", icon: "phone",
    blurb: "Every call, every recording, and the ones worth hearing.",
    tabs: [
      { href: "/dashboard/calls", label: "Call logs", hint: "Every call made and received", who: "all", keywords: "history export" },
      { href: "/dashboard/recordings", label: "Recordings", hint: "Listen to calls and read summaries", who: "all", keywords: "audio transcript failed" },
      { href: "/dashboard/training", label: "Calls to learn from", hint: "Best and worst calls to train on", who: "admin", keywords: "training score" },
    ],
  },
  {
    id: "funnel", label: "Funnel", icon: "chart",
    blurb: "How fast leads move, and where they get stuck.",
    tabs: [
      { href: "/dashboard/velocity", label: "Sales Velocity", hint: "How long a lead waits for its first call", who: "admin", keywords: "speed to lead" },
      { href: "/dashboard/xray", label: "Sales X-Ray", hint: "Why deals are lost", who: "admin", keywords: "objections lost reasons" },
      { href: "/dashboard/platform/leaks", label: "Where leads are dying", hint: "Leads nobody is working", who: "super", keywords: "leaks rotting" },
      { href: "/dashboard/reports", label: "Reports", hint: "Build and download a report", who: "roleAdmin", keywords: "excel download" },
    ],
  },
  {
    id: "team", label: "Team", icon: "users",
    blurb: "Your telecallers, their day and their phones.",
    tabs: [
      { href: "/dashboard/salespeople", label: "Salespeople", hint: "Your team and invite links", who: "all", keywords: "telecallers invite" },
      { href: "/dashboard/platform/telecallers", label: "Telecallers · add user", hint: "Create a telecaller login", who: "super", keywords: "new user add telecaller" },
      { href: "/dashboard/platform/telecallers-activity", label: "Telecaller activity", hint: "Read a telecaller's WhatsApp and calls", who: "super", keywords: "chats whatsapp" },
      { href: "/dashboard/attendance", label: "Attendance", hint: "Who worked which day", who: "roleAdmin", keywords: "present absent" },
      { href: "/dashboard/apps", label: "App downloads", hint: "Get the phone app", who: "all", keywords: "apk install android" },
    ],
  },
  {
    id: "coach", label: "AI Coach", icon: "bot",
    blurb: "What the AI knows, and what it tells your team to say.",
    tabs: [
      { href: "/dashboard/coach", label: "AI Coach", hint: "What each rep should say differently", who: "admin", keywords: "coaching" },
      { href: "/dashboard/rag", label: "RAG", hint: "Teach the AI your projects and objections", who: "admin", keywords: "brain knowledge guidebook objection" },
      { href: "/dashboard/content", label: "Content Library", hint: "Brochures and messages reps can send", who: "admin", keywords: "brochure pdf" },
      { href: "/dashboard/projects", label: "Buyer Projects", hint: "Projects, prices and locations", who: "admin", keywords: "inventory price" },
    ],
  },
  {
    id: "ads", label: "Ads (Meta)", icon: "trending",
    blurb: "What your ad money brings back.",
    tabs: [
      { href: "/dashboard/ads", label: "Ads Manager", hint: "Spend, leads and bookings per ad", who: "super", keywords: "meta facebook campaign spend capi andromeda" },
      { href: "/dashboard/platform/location-interest", label: "Location demand", hint: "Which buyers want which location", who: "super", keywords: "area city" },
    ],
  },
  {
    id: "whatsapp", label: "WhatsApp & Automation", icon: "chat",
    blurb: "WhatsApp linking and every automatic message.",
    tabs: [
      { href: "/dashboard/whatsapp", label: "WhatsApp", hint: "Link phones and read chats", who: "admin", keywords: "qr scan capture" },
      { href: "/dashboard/automations", label: "Automation Center", hint: "Every automatic message and if it arrived", who: "admin", keywords: "alerts messages" },
    ],
  },
  {
    id: "health", label: "Health", icon: "pulse",
    blurb: "Is everything feeding the CRM? Red means fix it now.",
    tabs: [
      { href: "/dashboard/health", label: "Phone Health", hint: "WhatsApp capture, phone sync and recordings", who: "admin", keywords: "status broken sync capture" },
      { href: "/dashboard/integrity", label: "Integrity check", hint: "Calls that look fake or too short", who: "admin", keywords: "fraud fake" },
      { href: "/dashboard/platform/storage", label: "Recording storage", hint: "Google Drive for recordings", who: "super", keywords: "drive google" },
    ],
  },
  {
    id: "platform", label: "Platform", icon: "radar",
    blurb: "Every company on Call Pro AI.",
    tabs: [
      { href: "/dashboard/platform/hq", label: "Platform HQ", hint: "Today across every company", who: "super", keywords: "hq all companies" },
      { href: "/dashboard/platform", label: "Companies", hint: "Add and manage companies", who: "super", keywords: "new company tenant" },
    ],
  },
];

export type Viewer = { role: string | null | undefined; isSuper: boolean };

export function canSee(who: Audience, v: Viewer): boolean {
  const roleAdmin = v.role === "admin";
  switch (who) {
    case "all": return true;
    case "admin": return roleAdmin || v.isSuper;
    case "roleAdmin": return roleAdmin;
    case "nonAdmin": return !roleAdmin;
    case "super": return v.isSuper;
  }
}

/** Sections this person can open, each with only the tabs they can see. */
export function visibleNav(v: Viewer): NavSection[] {
  return NAV
    .map((s) => ({ ...s, tabs: s.tabs.filter((t) => canSee(t.who, v)) }))
    .filter((s) => s.tabs.length > 0);
}

/** Does this tab own the path? "/dashboard" owns only itself. */
function owns(href: string, path: string): boolean {
  if (href === "/dashboard") return path === "/dashboard";
  return path === href || path.startsWith(href + "/");
}

/**
 * The section and tab a path belongs to. Longest matching tab wins, so
 * /dashboard/platform/hq is Platform HQ and not Companies.
 */
export function locate(path: string, sections: NavSection[] = NAV): { section: NavSection; tab: NavTab } | null {
  let best: { section: NavSection; tab: NavTab } | null = null;
  for (const section of sections) {
    for (const tab of section.tabs) {
      if (owns(tab.href, path) && (!best || tab.href.length > best.tab.href.length)) {
        best = { section, tab };
      }
    }
  }
  return best;
}

/** Keep the company being viewed when moving between pages. */
export function withCompany(href: string, company: string | null): string {
  return company ? `${href}?company=${encodeURIComponent(company)}` : href;
}
