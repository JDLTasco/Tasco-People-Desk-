// "Overdue to be assigned" on the HR dashboard (John, 2026-10-10): tickets
// still in the Pool past the 1-working-day assignment deadline
// (lib/tickets/assignment-kpi.ts). Same rules as the rest of the dashboard:
// soft-deleted excluded, confidentialFilter() for the viewer -- under AND,
// since that filter carries its own OR (see the v2.3.1 fix).
import { prisma } from "../prisma";
import type { UserRole } from "../roles";
import { confidentialFilter } from "../tickets/queries";
import { loadHolidaySet } from "../calendar/holidays";
import { workingDaysBetween } from "../calendar/working-days";
import { assignmentDueAt, isAssignmentOverdue } from "../tickets/assignment-kpi";

export interface OverdueAssignment {
  id: string;
  ticketNo: string;
  subject: string;
  isConfidential: boolean;
  requesterName: string;
  priority: string;
  category: string | null;
  businessUnit: string | null;
  receivedAt: string;
  assignDueAt: string;
  /** Whole working days past the deadline (0 = less than one). */
  workingDaysLate: number;
}

export async function loadOverdueAssignments(userId: string, role: UserRole, now: Date = new Date()): Promise<OverdueAssignment[]> {
  const [rows, holidays] = await Promise.all([
    prisma.ticket.findMany({
      where: { AND: [{ isDeleted: false, status: "NEW", assignedToId: null }, confidentialFilter(userId, role)] },
      select: {
        id: true,
        ticketNo: true,
        subject: true,
        isConfidential: true,
        requesterName: true,
        priority: true,
        status: true,
        receivedAt: true,
        assignedAt: true,
        assignedToId: true,
        category: { select: { name: true } },
        businessUnit: { select: { name: true } },
      },
      orderBy: { receivedAt: "asc" },
    }),
    loadHolidaySet(),
  ]);
  return rows
    .filter((t) => isAssignmentOverdue(t, now, holidays))
    .map((t) => {
      const due = assignmentDueAt(t.receivedAt, holidays);
      return {
        id: t.id,
        ticketNo: t.ticketNo,
        subject: t.subject,
        isConfidential: t.isConfidential,
        requesterName: t.requesterName,
        priority: t.priority,
        category: t.category?.name ?? null,
        businessUnit: t.businessUnit?.name ?? null,
        receivedAt: t.receivedAt.toISOString(),
        assignDueAt: due.toISOString(),
        workingDaysLate: workingDaysBetween(due, now, holidays),
      };
    });
}
