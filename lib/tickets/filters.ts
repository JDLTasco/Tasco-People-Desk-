import type { TicketListRow } from "./queries";
import { effectiveDueDate, isOverdue } from "./due-dates";

// Dashboard list-view filtering (requester/status/priority/business unit/
// assignee/due) -- pure so it's testable independent of the client
// component that holds the actual filter-control state
// (components/FilterableTicketList.tsx).

export type DueFilter = "" | "OVERDUE" | "TODAY" | "WEEK" | "MONTH";

export interface TicketFilterCriteria {
  ticketNo?: string;
  requester?: string;
  status?: string;
  priority?: string;
  /** "__none__" matches tickets with no business unit set. */
  businessUnit?: string;
  /** "__unassigned__" matches tickets with no assignee. */
  assignee?: string;
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

export function matchesFilters(ticket: TicketListRow, criteria: TicketFilterCriteria, now: Date = new Date()): boolean {
  if (criteria.ticketNo) {
    if (!ticket.ticketNo.toLowerCase().includes(criteria.ticketNo.toLowerCase())) return false;
  }
  if (criteria.requester) {
    if (!ticket.requesterName.toLowerCase().includes(criteria.requester.toLowerCase())) return false;
  }
  if (criteria.status && ticket.status !== criteria.status) return false;
  if (criteria.priority && ticket.priority !== criteria.priority) return false;
  if (criteria.businessUnit) {
    if (criteria.businessUnit === "__none__") {
      if (ticket.businessUnit !== null) return false;
    } else if (ticket.businessUnit?.name !== criteria.businessUnit) {
      return false;
    }
  }
  if (criteria.assignee) {
    if (criteria.assignee === "__unassigned__") {
      if (ticket.assignee !== null) return false;
    } else {
      const label = ticket.assignee ? `${ticket.assignee.displayName} (${ticket.assignee.initials})` : "";
      if (label !== criteria.assignee) return false;
    }
  }
  if (!matchesDueFilter(ticket, criteria.due, now)) return false;
  return true;
}
