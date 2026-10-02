// Effective due date and overdue determination (§5, §8). Deliberately NOT
// stored columns -- both are fully derivable from sla_due_at/target_due_at,
// so they live here rather than as schema fields (see schema.prisma's own
// comment on this).
//
// Operator amendment (John, 2026-10-03): the target due date is the KPI.
// It is set automatically from the priority in working days (see
// target-due.ts), can be overridden earlier OR later, and drives the due
// date, Overdue list and escalation on its own. The old SLA clock
// (sla_due_at) only applies to a ticket with no target date -- tickets
// created before this change, until someone sets one or changes priority.
// Previously: LEAST(sla_due_at, target_due_at), target could only bring
// the deadline forward.
import type { TicketStatus } from "./transitions";

export function effectiveDueDate(slaDueAt: Date, targetDueAt: Date | null): Date {
  return targetDueAt ?? slaDueAt;
}

/** Overdue when the effective due date has passed and the status is not CLOSED or ARCHIVED. */
export function isOverdue(
  slaDueAt: Date,
  targetDueAt: Date | null,
  status: TicketStatus,
  now: Date = new Date(),
): boolean {
  if (status === "CLOSED" || status === "ARCHIVED") return false;
  return effectiveDueDate(slaDueAt, targetDueAt) < now;
}

/** Which deadline is driving the effective due date -- used to label "which deadline was breached" (§8's escalation email). */
export function breachedDeadline(_slaDueAt: Date, targetDueAt: Date | null): "SLA" | "TARGET" {
  return targetDueAt ? "TARGET" : "SLA";
}
