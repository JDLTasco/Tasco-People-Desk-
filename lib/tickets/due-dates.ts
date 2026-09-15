// Effective due date and overdue determination (§5, §8). Deliberately NOT
// stored columns -- both are fully derivable from sla_due_at/target_due_at,
// so they live here rather than as schema fields (see schema.prisma's own
// comment on this).
import type { TicketStatus } from "./transitions";

/**
 * "LEAST(sla_due_at, COALESCE(target_due_at, sla_due_at))" -- a target due
 * date can only bring the deadline forward, never extend the SLA floor.
 */
export function effectiveDueDate(slaDueAt: Date, targetDueAt: Date | null): Date {
  if (!targetDueAt) return slaDueAt;
  return targetDueAt < slaDueAt ? targetDueAt : slaDueAt;
}

/**
 * "A ticket is overdue when either sla_due_at or target_due_at has passed,
 * whichever comes first, and the status is not CLOSED or ARCHIVED."
 */
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
export function breachedDeadline(slaDueAt: Date, targetDueAt: Date | null): "SLA" | "TARGET" {
  if (!targetDueAt) return "SLA";
  return targetDueAt < slaDueAt ? "TARGET" : "SLA";
}
