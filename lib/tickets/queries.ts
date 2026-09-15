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

/**
 * Ticket merging (added directly with John, Sep 2026): a small text/ticket-
 * number search used by the merge picker. Respects §9's confidentiality
 * rule (never surface a confidential ticket a viewer can't already see,
 * same filter every other list view already applies) and excludes
 * ARCHIVED tickets (never a valid merge source or target).
 */
export interface ArchiveSearchFilters {
  ticketNo?: string;
  requester?: string;
  subject?: string;
  categoryId?: string;
  businessUnitId?: string;
  assigneeId?: string;
  from?: string;
  to?: string;
  legalHold?: boolean;
  includeNotARequest?: boolean;
}

/**
 * §11 "Archive search": full-text over archived tickets. "'Not a
 * request' closures excluded by default, with a toggle to include."
 * Confidentiality-scoped the same as every other search/list view.
 */
export async function searchArchive(userId: string, role: UserRole, filters: ArchiveSearchFilters): Promise<TicketListRow[]> {
  const where: Prisma.TicketWhereInput = {
    status: "ARCHIVED",
    isDeleted: false,
    ...confidentialFilter(userId, role),
  };
  if (!filters.includeNotARequest) {
    where.closeReason = { not: "NOT_A_REQUEST" };
  }
  if (filters.ticketNo) where.ticketNo = { contains: filters.ticketNo, mode: "insensitive" };
  if (filters.requester) {
    where.OR = [
      { requesterName: { contains: filters.requester, mode: "insensitive" } },
      { requesterEmail: { contains: filters.requester, mode: "insensitive" } },
    ];
  }
  if (filters.subject) where.subject = { contains: filters.subject, mode: "insensitive" };
  if (filters.categoryId) where.categoryId = filters.categoryId;
  if (filters.businessUnitId) where.businessUnitId = filters.businessUnitId;
  if (filters.assigneeId) where.assignedToId = filters.assigneeId;
  if (filters.legalHold !== undefined) where.isLegalHold = filters.legalHold;
  if (filters.from || filters.to) {
    where.requestDate = {
      ...(filters.from ? { gte: new Date(filters.from) } : {}),
      ...(filters.to ? { lte: new Date(filters.to) } : {}),
    };
  }

  return prisma.ticket.findMany({
    where,
    select: TICKET_LIST_SELECT,
    orderBy: { requestDate: "desc" },
    take: 200,
  });
}

const LEGAL_HOLD_SELECT = {
  id: true,
  ticketNo: true,
  subject: true,
  legalHoldReason: true,
  legalHoldSetAt: true,
  legalHoldSetBy: { select: { displayName: true } },
} satisfies Prisma.TicketSelect;

export type LegalHoldRow = Prisma.TicketGetPayload<{ select: typeof LEGAL_HOLD_SELECT }>;

/**
 * §10 "Admin legal holds view": "lists every ticket with an active hold
 * ... sorts oldest first" -- so a hold nobody has reviewed surfaces
 * first, not last. The "over 12 months old" flag is computed by the
 * caller (a pure display concern, not a query concern).
 */
export async function getLegalHoldTickets(): Promise<LegalHoldRow[]> {
  return prisma.ticket.findMany({
    where: { isLegalHold: true },
    select: LEGAL_HOLD_SELECT,
    orderBy: { legalHoldSetAt: "asc" },
  });
}

const DELETED_SELECT = {
  id: true,
  ticketNo: true,
  subject: true,
  deleteReason: true,
  deletedAt: true,
  deletedBy: { select: { displayName: true } },
} satisfies Prisma.TicketSelect;

export type DeletedTicketRow = Prisma.TicketGetPayload<{ select: typeof DELETED_SELECT }>;

/** §10 "Deletion": "Removed from all views except an ADMIN 'Deleted' view." */
export async function getDeletedTickets(): Promise<DeletedTicketRow[]> {
  return prisma.ticket.findMany({
    where: { isDeleted: true },
    select: DELETED_SELECT,
    orderBy: { deletedAt: "desc" },
  });
}

export async function searchTickets(userId: string, role: UserRole, query: string): Promise<TicketListRow[]> {
  const q = query.trim();
  if (!q) return [];
  return prisma.ticket.findMany({
    where: {
      isDeleted: false,
      status: { not: "ARCHIVED" },
      OR: [{ ticketNo: { contains: q, mode: "insensitive" } }, { subject: { contains: q, mode: "insensitive" } }],
      ...confidentialFilter(userId, role),
    },
    select: TICKET_LIST_SELECT,
    orderBy: { receivedAt: "desc" },
    take: 20,
  });
}
