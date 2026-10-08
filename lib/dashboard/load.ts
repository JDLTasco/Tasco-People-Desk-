// Loads the rows the HR dashboard aggregates (John, 2026-10-03). The ONLY
// place dashboard data is read: soft-deleted tickets are excluded and every
// row goes through confidentialFilter() for the viewer (§9), so a figure can
// never include a confidential ticket the viewer couldn't open. Load-bearing
// since 2026-10-05, when the dashboard was opened to HR Officers too.
import { prisma } from "../prisma";
import type { UserRole } from "../roles";
import { confidentialFilter } from "../tickets/queries";
import { loadHolidaySet } from "../calendar/holidays";
import { buildDashboard, type DashboardTicket } from "./metrics";
import type { ReportPeriod } from "./period";

export async function loadDashboard(userId: string, role: UserRole, period: ReportPeriod, now: Date = new Date()) {
  const [rows, holidays] = await Promise.all([
    prisma.ticket.findMany({
      where: { isDeleted: false, ...confidentialFilter(userId, role) },
      select: {
        id: true,
        status: true,
        priority: true,
        receivedAt: true,
        closedAt: true,
        closeReason: true,
        slaDueAt: true,
        targetDueAt: true,
        assignee: { select: { id: true, displayName: true } },
        businessUnit: { select: { name: true } },
        category: { select: { name: true } },
        actionStatus: { select: { name: true } },
      },
    }),
    loadHolidaySet(),
  ]);
  return buildDashboard(rows as DashboardTicket[], period, now, holidays);
}
