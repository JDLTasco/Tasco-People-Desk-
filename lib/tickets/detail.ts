import { prisma } from "../prisma";
import { canViewConfidentialTicket } from "../rbac";
import type { UserRole } from "../roles";
import { determineAccessBasis } from "./confidential-access";
import { writeAuditLog } from "../audit";
import { getRequestCorrelationId } from "../correlation";
import { sortMessagesChronologically } from "./message-order";

export const TICKET_DETAIL_INCLUDE = {
  category: { select: { id: true, name: true } },
  businessUnit: { select: { id: true, name: true } },
  assignee: { select: { id: true, displayName: true, initials: true } },
  firstViewedBy: { select: { id: true, displayName: true } },
  messages: {
    // Not orderBy: { receivedAt: "asc" } -- outbound messages (Allocation,
    // Outcome, SLA escalation) never populate received_at, only sent_at, so
    // that alone would push every automated email to the end of the thread
    // regardless of when it actually went out (Postgres sorts NULLS LAST),
    // ahead of nothing and behind replies that arrived afterward. Fixed
    // below via messageTimestamp()/sortMessagesChronologically(), the same
    // per-direction-timestamp approach lib/archive/render.ts already used
    // correctly for the archive export -- this view just never got it.
    // DB-level order here is arbitrary; re-sorted after fetch.
    include: { emailLog: { orderBy: { attemptedAt: "asc" as const } } },
  },
  notes: {
    where: { isCurrent: true },
    orderBy: { createdAt: "asc" as const },
    include: { author: { select: { id: true, displayName: true, initials: true } } },
  },
  statusHistory: {
    orderBy: { createdAt: "asc" as const },
    include: { actor: { select: { id: true, displayName: true, initials: true } } },
  },
  attachments: {
    orderBy: { createdAt: "asc" as const },
    include: { uploadedBy: { select: { displayName: true } } },
  },
  accessGrants: { select: { userId: true } },
  mergedIntoTicket: { select: { id: true, ticketNo: true } },
  mergedFromTickets: { select: { id: true, ticketNo: true } },
  legalHoldSetBy: { select: { displayName: true } },
  confidentialSetBy: { select: { displayName: true } },
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
    // §9.1: every view of a confidential ticket, not just the first.
    // "No break-glass mechanism ... The audit record is the control" --
    // this must never be skippable, so it happens unconditionally here
    // rather than behind any UI action.
    await writeAuditLog({
      correlationId: await getRequestCorrelationId(),
      actorId: userId,
      action: "CONFIDENTIAL_TICKET_VIEWED",
      entity: "ticket",
      entityId: ticket.id,
      ticketId: ticket.id,
      accessBasis: determineAccessBasis(role, isAssignee, hasExplicitGrant),
    });
  }

  if (!ticket.firstViewedAt) {
    const result = await prisma.ticket.updateMany({
      where: { id: ticket.id, firstViewedAt: null },
      data: { firstViewedAt: new Date(), firstViewedById: userId },
    });
    if (result.count > 0) {
      const refreshed = await prisma.ticket.findUnique({ where: { id }, include: TICKET_DETAIL_INCLUDE });
      if (!refreshed) return null;
      return { ...refreshed, messages: sortMessagesChronologically(refreshed.messages) };
    }
  }
  return { ...ticket, messages: sortMessagesChronologically(ticket.messages) };
}
