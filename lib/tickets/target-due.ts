// Automatic target due date (operator amendment, John, 2026-10-03): set from
// the priority in working days (Mon-Fri, Melbourne calendar; public holidays
// are NOT skipped -- staff override the date when one falls inside). It can
// be overridden (with a reason), and it is the date the People Desk tracks
// as its KPI -- see due-dates.ts.
import type { Priority } from "../ingestion/priority";

export const TARGET_WORKING_DAYS: Record<Priority, number> = { P1: 3, P2: 10, P3: 20 };

/** Prefix that marks a target due date as system-set rather than a staff override. */
export const AUTO_TARGET_REASON_PREFIX = "Automatic:";

const weekdayFormatter = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Melbourne", weekday: "short" });

function isMelbourneWeekend(date: Date): boolean {
  const day = weekdayFormatter.format(date);
  return day === "Sat" || day === "Sun";
}

/**
 * Same time of day, `days` working days later. Steps a calendar day at a
 * time and counts only days that land on Mon-Fri in Melbourne, so a Friday
 * arrival + 3 is Wednesday, and a Saturday arrival + 3 is also Wednesday.
 * Steps are 24h, so across a daylight-saving change the time shifts by an hour.
 */
export function addWorkingDays(start: Date, days: number): Date {
  let current = new Date(start.getTime());
  let counted = 0;
  while (counted < days) {
    current = new Date(current.getTime() + 24 * 60 * 60 * 1000);
    if (!isMelbourneWeekend(current)) counted++;
  }
  return current;
}

export function autoTargetReason(priority: Priority): string {
  return `${AUTO_TARGET_REASON_PREFIX} ${priority} = ${TARGET_WORKING_DAYS[priority]} working days`;
}

export function isAutoTargetReason(reason: string | null | undefined): boolean {
  return !!reason && reason.startsWith(AUTO_TARGET_REASON_PREFIX);
}

export function autoTargetDue(receivedAt: Date, priority: Priority): { targetDueAt: Date; targetDueReason: string } {
  return {
    targetDueAt: addWorkingDays(receivedAt, TARGET_WORKING_DAYS[priority]),
    targetDueReason: autoTargetReason(priority),
  };
}

/**
 * When priority changes, the target due date follows it -- unless a staff
 * member has overridden it, in which case their date stands. A ticket with
 * no target date yet (the tickets that existed before 2026-10-03) gets one.
 */
export function shouldRecalculateTarget(current: { targetDueAt: Date | null; targetDueReason: string | null }): boolean {
  return current.targetDueAt === null || isAutoTargetReason(current.targetDueReason);
}
