import { prisma } from "../prisma";

// §10's archive artefacts need more than the ticket detail page does (the
// legal-hold/confidential setter names, every message/note regardless of
// who's "viewing," no permission gate at all -- archiving is a system
// operation, not a user viewing a ticket) -- a dedicated loader rather
// than reusing lib/tickets/detail.ts's TICKET_DETAIL_INCLUDE.
export const ARCHIVE_TICKET_INCLUDE = {
  category: { select: { name: true } },
  businessUnit: { select: { name: true } },
  assignee: { select: { displayName: true } },
  firstViewedBy: { select: { displayName: true } },
  legalHoldSetBy: { select: { displayName: true } },
  legalHoldClearedBy: { select: { displayName: true } },
  mergedIntoTicket: { select: { ticketNo: true } },
  messages: { orderBy: { receivedAt: "asc" as const } },
  notes: {
    where: { isCurrent: true },
    orderBy: { createdAt: "asc" as const },
    include: { author: { select: { displayName: true } } },
  },
  statusHistory: {
    orderBy: { createdAt: "asc" as const },
    include: { actor: { select: { displayName: true } } },
  },
  attachments: { orderBy: { createdAt: "asc" as const } },
} as const;

export type ArchiveTicket = NonNullable<Awaited<ReturnType<typeof loadTicketForArchive>>>;

export async function loadTicketForArchive(ticketId: string) {
  return prisma.ticket.findUnique({ where: { id: ticketId }, include: ARCHIVE_TICKET_INCLUDE });
}
