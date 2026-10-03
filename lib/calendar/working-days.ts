// Business calendar (John, 2026-10-03): working days are Monday-Friday in
// Australia/Melbourne, excluding the non-working days held in the
// non_working_days table (Victorian public holidays, Tasco shutdowns) --
// managed on Admin -> Calendar. Pure: the caller supplies the holiday set
// (lib/calendar/holidays.ts loads it from the database).
//
// Holiday set keys: "YYYY-MM-DD" for a one-off date, "*-MM-DD" for a date
// that recurs every year (non_working_days.is_recurring).
import { melbourneParts, melbourneWallTimeToUtc } from "../timezone";

const weekdayFormatter = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Melbourne", weekday: "short" });

const pad = (n: number) => String(n).padStart(2, "0");

/** The Melbourne calendar date of an instant, as "YYYY-MM-DD". */
export function melbourneDateKey(date: Date): string {
  const { year, month, day } = melbourneParts(date);
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Holiday-set key for a non_working_days row (its date column is a plain calendar date, stored as UTC midnight). */
export function holidayKey(date: Date, isRecurring: boolean): string {
  const key = date.toISOString().slice(0, 10);
  return isRecurring ? `*-${key.slice(5)}` : key;
}

export function buildHolidaySet(rows: { date: Date; isRecurring: boolean }[]): Set<string> {
  return new Set(rows.map((r) => holidayKey(r.date, r.isRecurring)));
}

export function isHoliday(date: Date, holidays: Set<string>): boolean {
  const key = melbourneDateKey(date);
  return holidays.has(key) || holidays.has(`*-${key.slice(5)}`);
}

/** Not Saturday, not Sunday (Melbourne), and not a listed non-working day. */
export function isWorkingDay(date: Date, holidays: Set<string>): boolean {
  const day = weekdayFormatter.format(date);
  if (day === "Sat" || day === "Sun") return false;
  return !isHoliday(date, holidays);
}

/** The same Melbourne wall-clock time `n` calendar days later (DST-correct). */
export function addCalendarDaysMelbourne(date: Date, n: number): Date {
  const p = melbourneParts(date);
  // Date.UTC normalises day overflow (e.g. 32 January -> 1 February).
  const shifted = new Date(Date.UTC(p.year, p.month - 1, p.day + n));
  const seconds = date.getUTCSeconds();
  const ms = date.getUTCMilliseconds();
  const base = melbourneWallTimeToUtc(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate(), p.hour, p.minute);
  return new Date(base.getTime() + seconds * 1000 + ms);
}

/**
 * `workingDays` working days after `start`, at the same Melbourne wall-clock
 * time. Steps a calendar day at a time and counts only working days, so a
 * Friday arrival + 3 is Wednesday, a Saturday arrival + 3 is also Wednesday,
 * and a public holiday in between pushes it a day further.
 */
export function addWorkingDays(start: Date, workingDays: number, holidays: Set<string>): Date {
  let current = start;
  let counted = 0;
  let guard = 0;
  while (counted < workingDays) {
    current = addCalendarDaysMelbourne(current, 1);
    if (isWorkingDay(current, holidays)) counted++;
    if (++guard > 3660) throw new Error("addWorkingDays: no working days found in ten years -- check the calendar");
  }
  return current;
}

/** Working days from `from` to `to` (each later calendar day that is a working day counts once). 0 if `to` is not after `from`. */
export function workingDaysBetween(from: Date, to: Date, holidays: Set<string>): number {
  if (to <= from) return 0;
  let count = 0;
  let current = from;
  let guard = 0;
  for (;;) {
    current = addCalendarDaysMelbourne(current, 1);
    if (melbourneDateKey(current) > melbourneDateKey(to)) break;
    if (isWorkingDay(current, holidays)) count++;
    if (++guard > 36600) break;
  }
  return count;
}
