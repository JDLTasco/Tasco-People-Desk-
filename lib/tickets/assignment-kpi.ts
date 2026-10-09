// Assignment KPI (John, 2026-10-10): every ticket must be claimed or
// assigned within 1 business day (24 business hours) of arriving.
//
// The clock only runs on working days (Mon-Fri, Melbourne, excluding the
// Admin -> Calendar non-working days -- lib/calendar/working-days.ts):
// - arrives on a working day: due at the same time on the next working day
//   (Friday 3pm -> Monday 3pm; Thursday before a Friday holiday -> Monday);
// - arrives on a weekend/holiday: the clock starts at midnight at the start
//   of the next working day, so it is due by the end of that day
//   (Saturday -> end of Monday).
// "Assigned" is tickets.assigned_at -- set once, by the first claim or
// assignment out of the Pool (a later reassignment doesn't change it).
import { addCalendarDaysMelbourne, addWorkingDays, isWorkingDay } from "../calendar/working-days";
import { melbourneParts, melbourneWallTimeToUtc } from "../timezone";

export const ASSIGNMENT_KPI_WORKING_DAYS = 1;

export interface AssignmentKpiTicket {
  status: string;
  receivedAt: Date;
  assignedAt: Date | null;
  assignedToId?: string | null;
}

/** When this ticket must be claimed/assigned by. */
export function assignmentDueAt(receivedAt: Date, holidays: Set<string>): Date {
  let start = receivedAt;
  if (!isWorkingDay(start, holidays)) {
    const p = melbourneParts(start);
    let day = melbourneWallTimeToUtc(p.year, p.month, p.day, 0, 0);
    let guard = 0;
    do {
      day = addCalendarDaysMelbourne(day, 1);
      if (++guard > 3660) throw new Error("assignmentDueAt: no working days found in ten years -- check the calendar");
    } while (!isWorkingDay(day, holidays));
    start = day;
  }
  return addWorkingDays(start, ASSIGNMENT_KPI_WORKING_DAYS, holidays);
}

/** Still sitting in the Pool, never claimed or assigned. */
export function isAwaitingAssignment(t: AssignmentKpiTicket): boolean {
  return t.status === "NEW" && !t.assignedAt && !t.assignedToId;
}

/** In the Pool and past its assignment deadline. */
export function isAssignmentOverdue(t: AssignmentKpiTicket, now: Date, holidays: Set<string>): boolean {
  return isAwaitingAssignment(t) && now.getTime() > assignmentDueAt(t.receivedAt, holidays).getTime();
}

/**
 * KPI result for one ticket: "met" (assigned by the deadline), "missed"
 * (assigned late, or still unassigned past the deadline), or null when it
 * doesn't count -- still in the Pool but not yet due, or closed straight from
 * the Pool without ever being assigned (Info only, Autoclose, merged...).
 */
export function assignmentKpiResult(t: AssignmentKpiTicket, now: Date, holidays: Set<string>): "met" | "missed" | null {
  const due = assignmentDueAt(t.receivedAt, holidays).getTime();
  if (t.assignedAt) return t.assignedAt.getTime() <= due ? "met" : "missed";
  if (isAwaitingAssignment(t)) return now.getTime() > due ? "missed" : null;
  return null;
}
