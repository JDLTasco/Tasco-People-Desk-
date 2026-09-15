import { prisma } from "../prisma";
import type { UserRole } from "../roles";
import { isOverdue } from "./due-dates";
import type { Prisma } from "@prisma/client";

const TICKET_LIST_SELECT = {
  id: true,
  ticketNo: true,
  subject: true,
  requesterName: true,
  status: true,
  priority: true,
  receivedAt: true,
  slaDueAt: true,
  targetDueAt: true,
  isConfidential: true,
  category: { select: { name: true } },
  businessUnit: { select: { name: true } },
  assignee: { select: { id: true, displayName: true, initials: true } },
} satisfies Prisma.TicketSelect;

export type TicketListRow = Prisma.TicketGetPayload<{ select: typeof TICKET_LIST_SELECT }>;

/**
 * §9: confidential tickets are "hidden entirely from pool, list and search
 * views for everyone else -- not greyed out, not a redacted stub." ADMIN
 * and HR_LEAD see every ticket per §3's table; HR_OFFICER only sees a
 * confidential ticket they're assigned to or explicitly granted on.
 */
function confidentialFilter(userId: string, role: UserRole): Prisma.TicketWhereInput {
  if (role === "ADMIN" || role === "HR_LEAD") {
    return {};
  }
  return {
    OR: [
      { isConfidential: false },
      { isConfidential: true, assignedToId: userId },
      { isConfidential: true, accessGrants: { some: { userId } } },
    ],
  };
}

/** Pool (§13): unassigned, sitting in NEW for anyone to self-claim -- the default landing view. */
export async function getPoolTickets(userId: string, role: UserRole): Promise<TicketListRow[]> {
  return prisma.ticket.findMany({
    where: {
      status: "NEW",
      isDeleted: false,
      ...confidentialFilter(userId, role),
    },
    select: TICKET_LIST_SELECT,
    orderBy: { receivedAt: "asc" },
  });
}

/** My tickets (§13): everything currently assigned to the caller, not yet archived. */
export async function getMyTickets(userId: string): Promise<TicketListRow[]> {
  return prisma.ticket.findMany({
    where: {
      assignedToId: userId,
      status: { not: "ARCHIVED" },
      isDeleted: false,
    },
    select: TICKET_LIST_SELECT,
    orderBy: { receivedAt: "asc" },
  });
}

/** All open (§13): every active ticket across all officers, regardless of assignment. */
export async function getAllOpenTickets(userId: string, role: UserRole): Promise<TicketListRow[]> {
  return prisma.ticket.findMany({
    where: {
      status: { in: ["NEW", "ALLOCATED", "IN_ACTION", "OUTCOME"] },
      isDeleted: false,
      ...confidentialFilter(userId, role),
    },
    select: TICKET_LIST_SELECT,
    orderBy: { receivedAt: "asc" },
  });
}

/**
 * Overdue (§13, §8): computed in application code from the same "all open"
 * set, via the pure isOverdue() helper -- not a stored column or a
 * hand-duplicated SQL WHERE, so the business rule lives in exactly one
 * place (lib/tickets/due-dates.ts).
 */
export async function getOverdueTickets(userId: string, role: UserRole): Promise<TicketListRow[]> {
  const open = await getAllOpenTickets(userId, role);
  return open.filter((t) => isOverdue(t.slaDueAt, t.targetDueAt, t.status));
}

/**
 * Closed (history): every ticket that has reached CLOSED or ARCHIVED,
 * across all officers -- a running record of everything resolved, not
 * scoped to who worked it. This is a lightweight "what's been closed"
 * list built off data that already exists; it is NOT §11's Archive
 * Search (full-text search over the archive artefacts themselves,
 * Stage 6) -- no archive artefacts exist yet since the archive job
 * (§10) hasn't been built. Most recently closed first.
 */
export async function getClosedTickets(userId: string, role: UserRole): Promise<TicketListRow[]> {
  return prisma.ticket.findMany({
    where: {
      status: { in: ["CLOSED", "ARCHIVED"] },
      isDeleted: false,
      ...confidentialFilter(userId, role),
    },
    select: TICKET_LIST_SELECT,
    orderBy: { closedAt: "desc" },
  });
}
