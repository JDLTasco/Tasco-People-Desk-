// Loads the non-working-day set (Admin -> Calendar) for the working-day
// calculations in lib/calendar/working-days.ts. Small table, read fresh on
// each use so an admin's change applies to the next ticket immediately.
import { prisma } from "../prisma";
import { buildHolidaySet } from "./working-days";

export async function loadHolidaySet(): Promise<Set<string>> {
  const rows = await prisma.nonWorkingDay.findMany({ select: { date: true, isRecurring: true } });
  return buildHolidaySet(rows);
}
