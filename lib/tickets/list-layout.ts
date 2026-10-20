// Ticket list column layout each staff member chooses by dragging (John,
// 2026-10-08): column order + widths, saved on their own user row
// (users.ticket_list_layout) so it follows them to any computer. Used by
// components/TicketListTable.tsx and /api/me/list-layout.

export const LIST_COLUMN_IDS = [
  "ticket",
  "received",
  "subject",
  "attachments",
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

// Columns added after people had already saved layouts (2026-10-20). A saved
// layout missing only these gets them put back in place (after the column
// they follow in the standard order) instead of being thrown away.
const ADDED_LATER: readonly ListColumnId[] = ["attachments"];
const ADDED_WIDTH = 5;

function addMissingColumns(order: unknown[], widths: unknown): { order: unknown[]; widths: unknown } {
  const missing = ADDED_LATER.filter((id) => !order.includes(id));
  if (missing.length === 0 || order.length + missing.length !== LIST_COLUMN_IDS.length) return { order, widths };
  const nextOrder = order.slice();
  const nextWidths = Array.isArray(widths) && widths.length === order.length ? widths.slice() : null;
  for (const id of missing) {
    const before = LIST_COLUMN_IDS[LIST_COLUMN_IDS.indexOf(id) - 1];
    const at = before === undefined ? 0 : nextOrder.indexOf(before) + 1;
    nextOrder.splice(at, 0, id);
    nextWidths?.splice(at, 0, ADDED_WIDTH);
  }
  if (!nextWidths || !nextWidths.every((n) => typeof n === "number")) return { order: nextOrder, widths: null };
  const sum = (nextWidths as number[]).reduce((a, b) => a + b, 0);
  return { order: nextOrder, widths: (nextWidths as number[]).map((w) => (w / sum) * 100) };
}

/** A cleaned-up layout, or null if `value` isn't one (bad order = null; bad widths = automatic). */
export function parseListLayout(value: unknown): ListLayout | null {
  if (typeof value !== "object" || value === null) return null;
  const saved = value as { order?: unknown; widths?: unknown };
  const { order, widths } = Array.isArray(saved.order) ? addMissingColumns(saved.order, saved.widths) : saved;
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
