import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiContext } from "@/lib/api-context";
import { badRequest, conflict, forbidden, notFound } from "@/lib/http-errors";
import { canActOnAssignedTicket } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";

interface Body {
  reason: string;
}

// Added 2026-09-23 (John: "add an ability to remove attachments from the
// ticket, with audit trail"). Same permission shape as every other ticket
// edit (assignee/HR_LEAD/ADMIN, canActOnAssignedTicket) -- confirmed with
// John rather than defaulting to the stricter ADMIN+step-up posture
// full ticket soft-delete uses, since most of what needs removing is
// routine noise (decorative inline images, a mistaken upload), not a
// security-sensitive act on its own.
//
// Soft-delete only, same posture as Ticket.isDeleted: sets
// removed_at/removed_by/remove_reason, never deletes the row or its blob.
// Blocked entirely under legal hold, same reasoning as ticket deletion --
// a hold exists precisely to stop anything being taken off the record.
export async function POST(request: Request, { params }: { params: { id: string; attachmentId: string } }) {
  const ctx = await requireApiContext(request);
  if (ctx instanceof Response) return ctx;
  const { session, correlationId } = ctx;

  const ticket = await prisma.ticket.findUnique({ where: { id: params.id } });
  if (!ticket || ticket.isDeleted) return notFound();

  const attachment = await prisma.ticketAttachment.findUnique({ where: { id: params.attachmentId } });
  if (!attachment || attachment.ticketId !== ticket.id) return notFound();

  const isAssignedTicket = ticket.assignedToId === session.user.id;
  if (!canActOnAssignedTicket(session.user.role, isAssignedTicket)) {
    return forbidden("Not permitted to remove attachments from this ticket");
  }

  const body = (await request.json().catch(() => ({}))) as Partial<Body>;
  if (!body.reason || !body.reason.trim()) {
    return badRequest("reason is required to remove an attachment");
  }

  if (ticket.isLegalHold) {
    return conflict("Cannot remove an attachment from a ticket under legal hold -- clear the hold first if removal is genuinely required", ticket);
  }

  if (attachment.removedAt) {
    return conflict("This attachment was already removed", attachment);
  }

  const updated = await prisma.ticketAttachment.updateMany({
    where: { id: attachment.id, removedAt: null },
    data: { removedAt: new Date(), removedById: session.user.id, removeReason: body.reason },
  });
  if (updated.count === 0) {
    const current = await prisma.ticketAttachment.findUnique({ where: { id: attachment.id } });
    return conflict("This attachment was already removed", current);
  }

  await writeAuditLog({
    correlationId,
    actorId: session.user.id,
    action: "TICKET_ATTACHMENT_REMOVED",
    entity: "ticket_attachment",
    entityId: attachment.id,
    ticketId: ticket.id,
    beforeJson: { removedAt: null },
    afterJson: { removedAt: new Date().toISOString(), filename: attachment.filename },
    reason: body.reason,
  });

  return NextResponse.json({ ok: true });
}
