// Ignored images (John, 2026-10-05): when an image goes on the ignore list,
// copies already on tickets are taken off with the normal reversible
// attachment removal (removed_at/by/reason + TICKET_ATTACHMENT_REMOVED audit
// row -- same as app/api/tickets/[id]/attachments/[attachmentId]/remove).
// Switching the entry off puts back only what this tidy took off (matched by
// its fixed reason), never something a person removed by hand.
//
// Left alone: tickets under legal hold (nothing comes off the record under a
// hold), ARCHIVED tickets (their archive files are already written) and
// deleted tickets.
import { prisma } from "../prisma";
import { writeAuditLog } from "../audit";
import { IGNORED_IMAGE_REMOVE_REASON } from "../ingestion/ignored-images";

const TIDY_SCOPE = { isLegalHold: false, isDeleted: false, status: { not: "ARCHIVED" as const } };

export async function removeExistingCopies(sha256: string, actorId: string, correlationId: string): Promise<number> {
  const copies = await prisma.ticketAttachment.findMany({
    where: { sha256, removedAt: null, ticket: TIDY_SCOPE },
    select: { id: true, ticketId: true, filename: true },
  });
  let removed = 0;
  for (const copy of copies) {
    const removedAt = new Date();
    const result = await prisma.ticketAttachment.updateMany({
      where: { id: copy.id, removedAt: null },
      data: { removedAt, removedById: actorId, removeReason: IGNORED_IMAGE_REMOVE_REASON },
    });
    if (result.count === 0) continue;
    removed++;
    await writeAuditLog({
      correlationId,
      actorId,
      action: "TICKET_ATTACHMENT_REMOVED",
      entity: "ticket_attachment",
      entityId: copy.id,
      ticketId: copy.ticketId,
      beforeJson: { removedAt: null },
      afterJson: { removedAt: removedAt.toISOString(), filename: copy.filename },
      reason: IGNORED_IMAGE_REMOVE_REASON,
    });
  }
  return removed;
}

export async function restoreTidiedCopies(sha256: string, actorId: string, correlationId: string): Promise<number> {
  const copies = await prisma.ticketAttachment.findMany({
    where: { sha256, removedAt: { not: null }, removeReason: IGNORED_IMAGE_REMOVE_REASON, ticket: TIDY_SCOPE },
    select: { id: true, ticketId: true, filename: true, removedAt: true },
  });
  let restored = 0;
  for (const copy of copies) {
    const result = await prisma.ticketAttachment.updateMany({
      where: { id: copy.id, removeReason: IGNORED_IMAGE_REMOVE_REASON },
      data: { removedAt: null, removedById: null, removeReason: null },
    });
    if (result.count === 0) continue;
    restored++;
    await writeAuditLog({
      correlationId,
      actorId,
      action: "TICKET_ATTACHMENT_RESTORED",
      entity: "ticket_attachment",
      entityId: copy.id,
      ticketId: copy.ticketId,
      beforeJson: { removedAt: copy.removedAt?.toISOString() ?? null, removeReason: IGNORED_IMAGE_REMOVE_REASON },
      afterJson: { removedAt: null, filename: copy.filename },
      reason: "Ignored image switched off",
    });
  }
  return restored;
}
