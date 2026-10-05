import type { Stage } from "@/lib/dashboard/stage";

export type Lead = {
  id: string;
  name: string | null;
  phone: string;
  company_name: string | null;
  status: string;
  stage: string;
  salesperson_id: string | null;
  budget: string | null;
  territory: string | null;
  created_at: string;
  notes: string | null;
  temperature: string | null;
  last_contacted_at: string | null;
};

/** Words only. Colour is a status, not a picture. */
export const TEMPS = [
  { code: "hot", label: "Hot", color: "var(--bad)" },
  { code: "warm", label: "Warm", color: "var(--warn)" },
  { code: "cold", label: "Cold", color: "var(--accent)" },
] as const;

export type LeadView = {
  id: string;
  title: string;
  meta: string;
  stageLabel: string;
  stageColor: string;
  tempLabel: string | null;
  tempColor: string | null;
  assignee: string | null;
  cross: boolean;
  hasNotes: boolean;
};

export function norm10(p: string) {
  return (p || "").replace(/\D/g, "").slice(-10);
}

export function timeAgo(iso: string | null, now = Date.now()): string | null {
  if (!iso) return null;
  const diff = now - new Date(iso).getTime();
  if (diff < 0) return null;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function istDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
  });
}

function stageText(stage: Stage | undefined, code: string): { label: string; color: string } {
  if (stage) return { label: stage.label, color: stage.color };
  if (!code) return { label: "No stage", color: "var(--warn)" };
  return { label: code.replace(/_/g, " "), color: "var(--warn)" };
}

/**
 * Build the strings a row paints. Called when the data changes, not on each
 * scroll frame, so a moving list does not format dates or walk the rep list.
 */
export function buildLeadViews(
  leads: Lead[],
  stages: Stage[],
  names: Map<string, string>,
  cross: Set<string>,
  showAssignee: boolean,
  now = Date.now(),
): LeadView[] {
  const byCode = new Map(stages.map((s) => [s.code, s]));
  const tempBy = new Map(TEMPS.map((t) => [t.code, t]));
  return leads.map((l) => {
    const stage = stageText(byCode.get(l.stage), l.stage);
    const temp = l.temperature ? tempBy.get(l.temperature as (typeof TEMPS)[number]["code"]) : undefined;
    const parts: string[] = [l.phone];
    if (l.company_name) parts.push(l.company_name);
    if (l.territory) parts.push(l.territory);
    if (l.budget) parts.push(l.budget);
    const ago = timeAgo(l.last_contacted_at, now);
    if (ago) parts.push(`last ${ago}`);
    if (l.created_at) parts.push(istDate(l.created_at));
    return {
      id: l.id,
      title: l.name || l.phone,
      meta: parts.join(" · "),
      stageLabel: stage.label,
      stageColor: stage.color,
      tempLabel: temp?.label ?? null,
      tempColor: temp?.color ?? null,
      assignee: showAssignee
        ? (l.salesperson_id ? (names.get(l.salesperson_id) ?? "—") : "Unassigned")
        : null,
      cross: l.phone ? cross.has(norm10(l.phone)) : false,
      hasNotes: !!l.notes && l.notes.trim().length > 0,
    };
  });
}
