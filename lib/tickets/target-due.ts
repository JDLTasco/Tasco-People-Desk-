// Automatic target due date (operator amendment, John, 2026-10-03): set from
// the priority in working days -- Monday-Friday in Melbourne, excluding the
// Victorian public holidays and Tasco shutdown dates on Admin -> Calendar
// (lib/calendar/working-days.ts). It can be overridden (with a reason), and
// it is the date the People Desk tracks as its KPI -- see due-dates.ts.
//
// Invariant: an existing ticket's target_due_at is never silently
// rewritten. A target is only calculated when a ticket is created, when its
// priority changes and the target is still automatic (not overridden), or
// when a ticket has no target at all yet (missingTargetFields).
import type { Priority } from "../ingestion/priority";
import { addWorkingDays } from "../calendar/working-days";

export const TARGET_WORKING_DAYS: Record<Priority, number> = { P1: 3, P2: 10, P3: 20 };

/** Prefix that marks a target due date as system-set rather than a staff override. */
export const AUTO_TARGET_REASON_PREFIX = "Automatic:";

/** P1 = 3, P2 = 10, P3 = 20 working days after receipt, same Melbourne time of day. */
export function calculateTargetDueDate(receivedAt: Date, priority: Priority, holidays: Set<string>): Date {
  return addWorkingDays(receivedAt, TARGET_WORKING_DAYS[priority], holidays);
}

export function autoTargetReason(priority: Priority): string {
  return `${AUTO_TARGET_REASON_PREFIX} ${priority} = ${TARGET_WORKING_DAYS[priority]} working days`;
}

export function isAutoTargetReason(reason: string | null | undefined): boolean {
  return !!reason && reason.startsWith(AUTO_TARGET_REASON_PREFIX);
}

export function autoTargetDue(
  receivedAt: Date,
  priority: Priority,
  holidays: Set<string>,
): { targetDueAt: Date; targetDueReason: string } {
  return {
    targetDueAt: calculateTargetDueDate(receivedAt, priority, holidays),
    targetDueReason: autoTargetReason(priority),
  };
}

/**
 * A ticket from before 2026-10-03 has no target due date. The first time it
 * is claimed, assigned or saved, it gets the automatic one for its current
 * priority -- even if the priority itself didn't change (found 2026-10-03:
 * choosing P3 on an already-P3 ticket left the date empty). Empty object when
 * a target is already set.
 */
export function missingTargetFields(
  current: { receivedAt: Date; targetDueAt: Date | null },
  priority: Priority,
  holidays: Set<string>,
): { targetDueAt?: Date; targetDueReason?: string } {
  return current.targetDueAt === null ? autoTargetDue(current.receivedAt, priority, holidays) : {};
}

/**
 * When priority changes, the target due date follows it -- unless a staff
 * member has overridden it, in which case their date stands. A ticket with
 * no target date yet (the tickets that existed before 2026-10-03) gets one.
 */
export function shouldRecalculateTarget(current: { targetDueAt: Date | null; targetDueReason: string | null }): boolean {
  return current.targetDueAt === null || isAutoTargetReason(current.targetDueReason);
}
