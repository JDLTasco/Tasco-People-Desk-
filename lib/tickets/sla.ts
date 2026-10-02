// §12 SLA hours per priority. Was duplicated three ways (ingestion, the
// ticket metadata PATCH route, and the seed script) -- consolidated here
// when P3 changed from 336h/14 days to 720h/30 days (operator amendment,
// 2026-09-16, not in the original v1.3 §12 text -- see STATUS.md).
import type { Priority } from "../ingestion/priority";
import { autoTargetDue, shouldRecalculateTarget } from "./target-due";

export const SLA_HOURS: Record<Priority, number> = { P1: 48, P2: 168, P3: 720 };

/** §5: sla_due_at = received_at + the priority's SLA hours; recalculated whenever priority changes. */
export function slaDueAtFor(receivedAt: Date, priority: Priority): Date {
  return new Date(receivedAt.getTime() + SLA_HOURS[priority] * 60 * 60 * 1000);
}

/**
 * The due-date fields to write when a ticket's priority changes: sla_due_at
 * always, and the automatic target due date unless a staff member has
 * overridden it (2026-10-03, see target-due.ts).
 */
export function dueFieldsForPriorityChange(
  current: { receivedAt: Date; targetDueAt: Date | null; targetDueReason: string | null },
  priority: Priority,
): { slaDueAt: Date; targetDueAt?: Date; targetDueReason?: string } {
  return {
    slaDueAt: slaDueAtFor(current.receivedAt, priority),
    ...(shouldRecalculateTarget(current) ? autoTargetDue(current.receivedAt, priority) : {}),
  };
}

export function isPriority(value: unknown): value is Priority {
  return value === "P1" || value === "P2" || value === "P3";
}
