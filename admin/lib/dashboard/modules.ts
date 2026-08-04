/**
 * The eight modules, what each one OWNS, and what it hands to the next.
 *
 * Before this file the dashboard was eight pages that did not know each other
 * existed. Measured: actions, coach and rag linked nowhere at all; velocity
 * linked to routing; pulse to health; automations to health and salespeople;
 * xray to pulse and velocity. Seven ad-hoc anchors between eight pages, and no
 * page could tell you where its own numbers came from or who consumed them.
 *
 * The fix is not "add a nav bar". A nav bar is a list of URLs; it does not stop
 * two pages computing the same number differently, and it does not tell a
 * manager which screen to trust when they disagree.
 *
 * What actually connects them is OWNERSHIP, stated once:
 *
 *   · `owns` — the question this module is the source of truth for. If a number
 *     answers that question, it is computed here and read everywhere else.
 *   · `feeds` — the modules that consume this one's output. Rendered as the
 *     "next" links, so every page ends by pointing at what to do with it.
 *   · `fedBy` — derived from `feeds`, never written by hand, so the graph
 *     cannot contradict itself.
 *
 * Adding a module means adding a row here. If you cannot say what it owns in
 * one line, it is a section of an existing module, not a new one — which is the
 * check this file exists to force.
 */

export type ModuleId =
  | "overview" | "actions" | "velocity" | "pulse"
  | "automations" | "xray" | "coach" | "rag";

export type DashboardModule = {
  id: ModuleId;
  href: string;
  label: string;
  icon: string;
  /** The one question this module is the source of truth for. */
  owns: string;
  /** Modules that consume this one's output. */
  feeds: ModuleId[];
};

export const MODULES: Record<ModuleId, DashboardModule> = {
  overview: {
    id: "overview", href: "/dashboard", label: "Overview", icon: "✨",
    owns: "Is the business moving today — volume, talk time, who is ahead.",
    feeds: ["actions", "velocity", "pulse"],
  },
  actions: {
    id: "actions", href: "/dashboard/actions", label: "Action Center", icon: "🗂",
    owns: "What a human must do right now, and nothing else.",
    feeds: ["pulse", "automations"],
  },
  velocity: {
    id: "velocity", href: "/dashboard/velocity", label: "Sales Velocity", icon: "⚡",
    owns: "How long a lead waits for its first call, and what the wait costs.",
    feeds: ["actions", "xray"],
  },
  pulse: {
    id: "pulse", href: "/dashboard/pulse", label: "Daily Pulse", icon: "🔔",
    owns: "What each telecaller actually did today, in their own words.",
    feeds: ["coach", "xray", "automations"],
  },
  automations: {
    id: "automations", href: "/dashboard/automations", label: "Automation Center", icon: "🎛",
    owns: "Every automated message, who receives it, and whether it arrived.",
    feeds: ["actions"],
  },
  xray: {
    id: "xray", href: "/dashboard/xray", label: "Sales X-Ray", icon: "🩻",
    owns: "Why deals die — the patterns across every conversation.",
    feeds: ["coach", "rag"],
  },
  coach: {
    id: "coach", href: "/dashboard/coach", label: "AI Coach", icon: "🤖",
    owns: "What to say differently tomorrow, per rep.",
    feeds: ["rag"],
  },
  rag: {
    id: "rag", href: "/dashboard/rag", label: "AI Brain (RAG)", icon: "🧠",
    owns: "What the AI knows, where it is guessing, and what it still needs.",
    feeds: ["coach", "xray"],
  },
};

export const MODULE_ORDER: ModuleId[] = [
  "overview", "actions", "velocity", "pulse", "automations", "xray", "coach", "rag",
];

/**
 * Which modules feed this one. Derived, so the graph is always consistent —
 * writing both directions by hand is how a link ends up pointing one way.
 */
export function fedBy(id: ModuleId): DashboardModule[] {
  return MODULE_ORDER
    .filter((m) => MODULES[m].feeds.includes(id))
    .map((m) => MODULES[m]);
}

export function feeds(id: ModuleId): DashboardModule[] {
  return MODULES[id].feeds.map((m) => MODULES[m]);
}
