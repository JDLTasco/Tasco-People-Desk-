import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiContext } from "@/lib/api-context";
import { badRequest, conflict, forbidden, notFound } from "@/lib/http-errors";
import { validateMerge } from "@/lib/tickets/transitions";
import { canMergeTickets } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";
import { writeStatusHistory } from "@/lib/tickets/history";

interface MergeBody {
  version: number;
  intoTicketId: string;
  intoVersion: number;
}

class MergeConflictError extends Error {}

// Ticket merging -- added directly with John, Sep 2026, not in the
// original v1.3 spec (design decisions recorded in STATUS.md). `params.id`
// is the ticket being merged AWAY (the "source"); body.intoTicketId is the
// one that stays prominent (the "target"). Correspondence, notes, and
// attachments physically move to the target (a single unified thread);
// the source ticket itself is closed (closeReason=MERGED) and kept as a
// pointer, not deleted -- its own status_history/audit_log stay put as
// the historical record of what happened to it, including this merge.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const ctx = await requireApiContext(request);
  if (ctx instanceof Response) return ctx;
  const { session, correlationId } = ctx;

  const body = (await request.json().catch(() => ({}))) as Partial<MergeBody>;
  if (typeof body.version !== "number" || typeof body.intoVersion !== "number" || !body.intoTicketId) {
    return badRequest("version, intoTicketId, and intoVersion are all required");
  }
  if (body.intoTicketId === params.id) {
    return badRequest("Cannot merge a ticket into itself");
  }

  const [source, target] = await Promise.all([
    prisma.ticket.findUnique({ where: { id: params.id } }),
    prisma.ticket.findUnique({ where: { id: body.intoTicketId } }),
  ]);
  if (!source || source.isDeleted) return notFound();
  if (!target || target.isDeleted) return badRequest("Target ticket does not exist");

  // §9's confidential ACL enforcement (who else can see moved content)
  // doesn't exist until Stage 6 -- refuse rather than risk relocating
  // confidential correspondence somewhere today's access model can't yet
  // protect correctly.
  if (source.isConfidential || target.isConfidential) {
    return badRequest("Confidential tickets cannot be merged until Stage 6's access-control enforcement exists");
  }
  if (source.mergedIntoTicketId) {
    return badRequest("This ticket was already merged into a different ticket");
  }
  if (target.mergedIntoTicketId) {
    return badRequest("The target ticket has itself already been merged into another ticket -- merge into that one instead");
  }

  const check = validateMerge(source.status, target.status);
  if (!check.ok) return badRequest(check.error!);

  const isAssigneeOfEitherTicket = source.assignedToId === session.user.id || target.assignedToId === session.user.id;
  if (!canMergeTickets(session.user.role, isAssigneeOfEitherTicket)) {
    return forbidden("You must be the assignee of one of the two tickets (or ADMIN/HR_LEAD) to merge them");
  }

  const mergedCcRecipients = Array.from(new Set([...target.ccRecipients, ...source.ccRecipients]));

  let moved: { messages: number; notes: number; attachments: number };
  try {
    moved = await prisma.$transaction(async (tx) => {
      const targetUpdate = await tx.ticket.updateMany({
        where: { id: target.id, version: body.intoVersion },
        data: { ccRecipients: mergedCcRecipients, version: { increment: 1 } },
      });
      if (targetUpdate.count === 0) throw new MergeConflictError("target");

      const sourceUpdate = await tx.ticket.updateMany({
        where: { id: source.id, version: body.version },
        data: {
          status: "CLOSED",
          closeReason: "MERGED",
          closedAt: new Date(),
          mergedIntoTicketId: target.id,
          version: { increment: 1 },
        },
      });
      if (sourceUpdate.count === 0) throw new MergeConflictError("source");

      const messages = await tx.ticketMessage.updateMany({ where: { ticketId: source.id }, data: { ticketId: target.id } });
      const notes = await tx.ticketNote.updateMany({ where: { ticketId: source.id }, data: { ticketId: target.id } });
      const attachments = await tx.ticketAttachment.updateMany({ where: { ticketId: source.id }, data: { ticketId: target.id } });

      return { messages: messages.count, notes: notes.count, attachments: attachments.count };
    });
  } catch (err) {
    if (err instanceof MergeConflictError) {
      const conflicted = err.message === "source" ? source.id : target.id;
      const current = await prisma.ticket.findUnique({ where: { id: conflicted } });
      return conflict("One of the two tickets changed since it was loaded -- reload and retry", current);
    }
    throw err;
  }

  await writeStatusHistory({
    ticketId: source.id,
    fromStatus: source.status,
    toStatus: "CLOSED",
    actorId: session.user.id,
    reason: `Merged into ${target.ticketNo}`,
    correlationId,
  });
  await writeAuditLog({
    correlationId,
    actorId: session.user.id,
    action: "TICKET_MERGED",
    entity: "ticket",
    entityId: source.id,
    ticketId: source.id,
    beforeJson: { status: source.status },
    afterJson: { status: "CLOSED", closeReason: "MERGED", mergedIntoTicketId: target.id, ...moved },
  });
  await writeAuditLog({
    correlationId,
    actorId: session.user.id,
    action: "TICKET_MERGE_RECEIVED",
    entity: "ticket",
    entityId: target.id,
    ticketId: target.id,
    afterJson: { mergedFromTicketId: source.id, mergedFromTicketNo: source.ticketNo, ...moved },
  });

  return NextResponse.json({
    sourceTicket: await prisma.ticket.findUnique({ where: { id: source.id } }),
    targetTicket: await prisma.ticket.findUnique({ where: { id: target.id } }),
  });
}
