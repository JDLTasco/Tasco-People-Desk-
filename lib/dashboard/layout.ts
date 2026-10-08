// Each staff member's own dashboard arrangement (John, 2026-10-08): section
// order, width and which sections are hidden, saved on their user row
// (users.dashboard_layout). Used by app/admin/dashboard and
// PUT /api/me/dashboard-layout.

export type SectionSize = "full" | "half" | "third";
export const SECTION_SIZES: SectionSize[] = ["full", "half", "third"];

/** Every dashboard section, in the standard order with its standard width. */
export const DASHBOARD_SECTIONS = [
  { id: "workload", label: "Workload now", size: "full" },
  { id: "terminations", label: "Upcoming terminations", size: "full" },
  { id: "byStatus", label: "Open tickets by status", size: "third" },
  { id: "byAssignee", label: "Open tickets by assignee", size: "third" },
  { id: "byBusinessUnit", label: "Open tickets by business unit", size: "third" },
  { id: "byCategory", label: "Open tickets by category", size: "third" },
  { id: "thisMonth", label: "This month", size: "full" },
  { id: "trends", label: "Trends and target-date compliance", size: "full" },
  { id: "compliance", label: "Target-date compliance", size: "full" },
  { id: "info", label: "About these figures", size: "full" },
] as const satisfies readonly { id: string; label: string; size: SectionSize }[];

export type DashboardSectionId = (typeof DASHBOARD_SECTIONS)[number]["id"];
const IDS: readonly string[] = DASHBOARD_SECTIONS.map((s) => s.id);
const isId = (v: unknown): v is DashboardSectionId => typeof v === "string" && IDS.includes(v);

export interface DashboardLayout {
  order: DashboardSectionId[];
  hidden: DashboardSectionId[];
  sizes: Partial<Record<DashboardSectionId, SectionSize>>;
}

/** A cleaned-up layout (unknown or repeated sections dropped), or null if `value` isn't one. */
export function parseDashboardLayout(value: unknown): DashboardLayout | null {
  if (typeof value !== "object" || value === null) return null;
  const { order, hidden, sizes } = value as Record<string, unknown>;
  if (!Array.isArray(order)) return null;
  const sizeMap: DashboardLayout["sizes"] = {};
  if (typeof sizes === "object" && sizes !== null) {
    for (const [id, size] of Object.entries(sizes)) {
      if (isId(id) && SECTION_SIZES.includes(size as SectionSize)) sizeMap[id] = size as SectionSize;
    }
  }
  return {
    order: Array.from(new Set(order.filter(isId))),
    hidden: Array.from(new Set(Array.isArray(hidden) ? hidden.filter(isId) : [])),
    sizes: sizeMap,
  };
}

export interface ResolvedSection {
  id: DashboardSectionId;
  label: string;
  size: SectionSize;
  hidden: boolean;
}

/**
 * The sections in this person's order. Any section missing from a saved
 * order (e.g. one added to the dashboard later) goes at the end.
 */
export function resolveDashboardLayout(layout: DashboardLayout | null): ResolvedSection[] {
  const byId = new Map(DASHBOARD_SECTIONS.map((s) => [s.id as DashboardSectionId, s]));
  const order = [...(layout?.order ?? []), ...DASHBOARD_SECTIONS.map((s) => s.id)].filter(
    (id, i, all) => all.indexOf(id) === i,
  );
  return order.map((id) => {
    const s = byId.get(id)!;
    return { id, label: s.label, size: layout?.sizes[id] ?? s.size, hidden: layout?.hidden.includes(id) ?? false };
  });
}

/** The layout to save for a resolved arrangement. */
export function toDashboardLayout(sections: ResolvedSection[]): DashboardLayout {
  const defaults = new Map(DASHBOARD_SECTIONS.map((s) => [s.id as DashboardSectionId, s.size as SectionSize]));
  const sizes: DashboardLayout["sizes"] = {};
  for (const s of sections) if (s.size !== defaults.get(s.id)) sizes[s.id] = s.size;
  return { order: sections.map((s) => s.id), hidden: sections.filter((s) => s.hidden).map((s) => s.id), sizes };
}
