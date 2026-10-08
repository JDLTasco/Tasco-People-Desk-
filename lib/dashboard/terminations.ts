// Upcoming Terminations on the HR dashboard (John, 2026-10-08): every open
// ticket in the Terminations/Resignations category. Same rules as the rest of
// the dashboard (lib/dashboard/load.ts): soft-deleted excluded, and
// confidentialFilter() for the viewer -- combined under AND, since that
// filter carries its own OR (see the v2.3.1 fix).
import { prisma } from "../prisma";
import type { UserRole } from "../roles";
import { confidentialFilter } from "../tickets/queries";
import { effectiveDueDate, isOverdue } from "../tickets/due-dates";
import { TERMINATION_CATEGORY_WORDS, terminationDateKey } from "../tickets/terminations";
import { getAssigneeColourMap } from "../users/colours";

export interface UpcomingTermination {
  id: string;
  ticketNo: string;
  subject: string;
  isConfidential: boolean;
  businessUnit: string | null;
  assignee: string | null;
  assigneeColour: number | null;
  /** "YYYY-MM-DD" or "" when not set yet. */
  terminationDate: string;
  dueAt: string;
  overdue: boolean;
}

export async function loadUpcomingTerminations(userId: string, role: UserRole): Promise<UpcomingTermination[]> {
  const [rows, colours] = await Promise.all([
    prisma.ticket.findMany({
      where: {
        AND: [
          { isDeleted: false, status: { notIn: ["CLOSED", "ARCHIVED"] } },
          { OR: TERMINATION_CATEGORY_WORDS.map((w) => ({ category: { name: { contains: w, mode: "insensitive" as const } } })) },
          confidentialFilter(userId, role),
        ],
      },
      select: {
        id: true,
        ticketNo: true,
        subject: true,
        isConfidential: true,
        status: true,
        slaDueAt: true,
        targetDueAt: true,
        terminationDate: true,
        businessUnit: { select: { name: true } },
        assignee: { select: { id: true, displayName: true } },
      },
    }),
    getAssigneeColourMap(),
  ]);
  return rows.map((t) => ({
    id: t.id,
    ticketNo: t.ticketNo,
    subject: t.subject,
    isConfidential: t.isConfidential,
    businessUnit: t.businessUnit?.name ?? null,
    assignee: t.assignee?.displayName ?? null,
    assigneeColour: t.assignee ? colours.get(t.assignee.id) ?? 0 : null,
    terminationDate: terminationDateKey(t.terminationDate),
    dueAt: effectiveDueDate(t.slaDueAt, t.targetDueAt).toISOString(),
    overdue: isOverdue(t.slaDueAt, t.targetDueAt, t.status),
  }));
}
