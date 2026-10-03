import type { TicketListRow } from "./queries";
import { effectiveDueDate, isOverdue } from "./due-dates";
import { displayStatus } from "./action-status";

// Dashboard list-view filtering and sorting (requester/status/priority/
// business unit/assignee/due) -- pure so it's testable independent of the
// client component that holds the actual control state
// (components/FilterableTicketList.tsx).
//
// 2026-10-03 (John): status, priority, business unit and assignee are
// multi-choice (a ticket matches if it matches ANY ticked value within one
// filter; different filters still combine with AND), and the list can be
// sorted by up to several fields in order.

export type DueFilter = "" | "OVERDUE" | "TODAY" | "WEEK" | "MONTH";

export interface TicketFilterCriteria {
  ticketNo?: string;
  requester?: string;
  /** Any of these (empty = any status). Compared against displayStatus(). */
  status?: string[];
  priority?: string[];
  /** "__none__" matches tickets with no business unit set. */
  businessUnit?: string[];
  /** "__unassigned__" matches tickets with no assignee. */
  assignee?: string[];
  due?: DueFilter;
}

function matchesDueFilter(ticket: TicketListRow, filter: DueFilter | undefined, now: Date): boolean {
  if (!filter) return true;
  if (filter === "OVERDUE") return isOverdue(ticket.slaDueAt, ticket.targetDueAt, ticket.status, now);

  const due = effectiveDueDate(ticket.slaDueAt, ticket.targetDueAt);
  const endOfWindow = new Date(now);
  if (filter === "TODAY") endOfWindow.setHours(23, 59, 59, 999);
  if (filter === "WEEK") endOfWindow.setDate(endOfWindow.getDate() + 7);
  if (filter === "MONTH") endOfWindow.setDate(endOfWindow.getDate() + 30);
  return due <= endOfWindow;
}

function anyOf(selected: string[] | undefined, value: string): boolean {
  return !selected || selected.length === 0 || selected.includes(value);
}

export function matchesFilters(ticket: TicketListRow, criteria: TicketFilterCriteria, now: Date = new Date()): boolean {
  if (criteria.ticketNo) {
    if (!ticket.ticketNo.toLowerCase().includes(criteria.ticketNo.toLowerCase())) return false;
  }
  if (criteria.requester) {
    if (!ticket.requesterName.toLowerCase().includes(criteria.requester.toLowerCase())) return false;
  }
  // Compared against what the list shows -- an action item's name (e.g.
  // "On Hold") in place of IN_ACTION (2026-10-01).
  if (!anyOf(criteria.status, displayStatus(ticket))) return false;
  if (!anyOf(criteria.priority, ticket.priority)) return false;
  if (!anyOf(criteria.businessUnit, ticket.businessUnit?.name ?? "__none__")) return false;
  // Full name only, matching the dropdown (initials suffix removed 2026-09-29).
  if (!anyOf(criteria.assignee, ticket.assignee?.displayName ?? "__unassigned__")) return false;
  if (!matchesDueFilter(ticket, criteria.due, now)) return false;
  return true;
}

// ---------- Sorting ----------

export type SortField =
  | "received"
  | "status"
  | "priority"
  | "due"
  | "assignee"
  | "requester"
  | "businessUnit"
  | "category";

export const SORT_FIELD_LABELS: Record<SortField, string> = {
  received: "Date received",
  status: "Status",
  priority: "Priority",
  due: "Due date",
  assignee: "Assignee",
  requester: "Requester",
  businessUnit: "Business unit",
  category: "Category",
};

export interface SortKey {
  field: SortField;
  direction: "asc" | "desc";
}

// Status sorts in lifecycle order, not alphabetically.
const STATUS_ORDER = ["NEW", "ALLOCATED", "IN_ACTION", "AWAITING_RESPONSE", "RESPONSE_RECEIVED", "OUTCOME", "CLOSED", "ARCHIVED"];

function sortValue(t: TicketListRow, field: SortField): number | string {
  switch (field) {
    case "received":
      return t.receivedAt.getTime();
    case "status":
      // Action items (e.g. On Hold) sit with IN_ACTION, then by name.
      return `${String(STATUS_ORDER.indexOf(t.status)).padStart(2, "0")}${t.actionStatus?.name ?? ""}`;
    case "priority":
      return t.priority;
    case "due":
      return effectiveDueDate(t.slaDueAt, t.targetDueAt).getTime();
    case "assignee":
      return t.assignee?.displayName ?? "￿"; // unassigned last
    case "requester":
      return t.requesterName;
    case "businessUnit":
      return t.businessUnit?.name ?? "￿";
    case "category":
      return t.category?.name ?? "￿";
  }
}

/** Sorts by each key in turn (first key decides, ties fall to the next). Stable; no keys = original order. */
export function sortTickets<T extends TicketListRow>(tickets: T[], keys: SortKey[]): T[] {
  if (keys.length === 0) return tickets;
  return tickets
    .map((t, i) => ({ t, i }))
    .sort((a, b) => {
      for (const key of keys) {
        const va = sortValue(a.t, key.field);
        const vb = sortValue(b.t, key.field);
        const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
        if (cmp !== 0) return key.direction === "asc" ? cmp : -cmp;
      }
      return a.i - b.i;
    })
    .map(({ t }) => t);
}
