// Ticket list column layout each staff member chooses by dragging (John,
// 2026-10-08): column order + widths, saved on their own user row
// (users.ticket_list_layout) so it follows them to any computer. Used by
// components/TicketListTable.tsx and /api/me/list-layout.

export const LIST_COLUMN_IDS = [
  "ticket",
  "received",
  "subject",
  "requester",
  "status",
  "priority",
  "category",
  "businessUnit",
  "assignee",
  "due",
] as const;

export type ListColumnId = (typeof LIST_COLUMN_IDS)[number];

/** `widths` are percentages of the table width in display order; null = automatic widths. */
export type ListLayout = { order: ListColumnId[]; widths: number[] | null };

/** A cleaned-up layout, or null if `value` isn't one (bad order = null; bad widths = automatic). */
export function parseListLayout(value: unknown): ListLayout | null {
  if (typeof value !== "object" || value === null) return null;
  const { order, widths } = value as { order?: unknown; widths?: unknown };
  if (
    !Array.isArray(order) ||
    order.length !== LIST_COLUMN_IDS.length ||
    new Set(order).size !== LIST_COLUMN_IDS.length ||
    !order.every((id) => (LIST_COLUMN_IDS as readonly unknown[]).includes(id))
  ) {
    return null;
  }
  const goodWidths =
    Array.isArray(widths) &&
    widths.length === LIST_COLUMN_IDS.length &&
    widths.every((n) => typeof n === "number" && Number.isFinite(n) && n > 0 && n <= 100);
  return { order: order as ListColumnId[], widths: goodWidths ? (widths as number[]) : null };
}
