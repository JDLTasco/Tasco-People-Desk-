import { prisma } from "../prisma";
import { canViewConfidentialTicket } from "../rbac";
import type { UserRole } from "../roles";

export const TICKET_DETAIL_INCLUDE = {
  category: { select: { id: true, name: true } },
  businessUnit: { select: { id: true, name: true } },
  assignee: { select: { id: true, displayName: true, initials: true } },
  firstViewedBy: { select: { id: true, displayName: true } },
  messages: { orderBy: { receivedAt: "asc" as const } },
  notes: {
    where: { isCurrent: true },
    orderBy: { createdAt: "asc" as const },
    include: { author: { select: { id: true, displayName: true, initials: true } } },
  },
  statusHistory: {
    orderBy: { createdAt: "asc" as const },
    include: { actor: { select: { id: true, displayName: true, initials: true } } },
  },
  accessGrants: { select: { userId: true } },
};

export type TicketDetail = NonNullable<Awaited<ReturnType<typeof loadTicketForViewer>>>;

/**
 * §9: returns null both when the ticket genuinely doesn't exist AND when a
 * confidential ticket exists but this viewer isn't allowed to see it -- the
 * caller must turn both cases into an identical 404, never a 403 ("a 403
 * confirms the ticket exists").
 *
 * Also performs §4's first-view stamp ("on first open by any user,
 * atomically set first_viewed_at and first_viewed_by if null") -- this is
 * the one function both the ticket-detail page and its API route call to
 * actually render a ticket's detail, so putting the stamp here (rather
 * than in each caller) guarantees every real "open" is counted exactly
 * once, and that no other route (claim, assign, notes, ...) accidentally
 * triggers it just by loading a ticket for its own purposes.
 */
export async function loadTicketForViewer(id: string, userId: string, role: UserRole) {
  const ticket = await prisma.ticket.findUnique({ where: { id }, include: TICKET_DETAIL_INCLUDE });
  if (!ticket || ticket.isDeleted) return null;

  if (ticket.isConfidential) {
    const hasExplicitGrant = ticket.accessGrants.some((g) => g.userId === userId);
    const isAssignee = ticket.assignedToId === userId;
    if (!canViewConfidentialTicket(role, { isAssignee, hasExplicitGrant })) {
      return null;
    }
  }

  if (!ticket.firstViewedAt) {
    const result = await prisma.ticket.updateMany({
      where: { id: ticket.id, firstViewedAt: null },
      data: { firstViewedAt: new Date(), firstViewedById: userId },
    });
    if (result.count > 0) {
      return prisma.ticket.findUnique({ where: { id }, include: TICKET_DETAIL_INCLUDE });
    }
  }
  return ticket;
}
