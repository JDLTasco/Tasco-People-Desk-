import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiContext } from "@/lib/api-context";
import { badRequest, conflict, forbidden, notFound } from "@/lib/http-errors";
import { hasFreshStepUp } from "@/lib/session";
import { canSoftDeleteTicket } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";

interface Body {
  version: number;
  reason: string;
}

// §10 "Deletion": ADMIN only, step-up, mandatory reason. Soft delete only
// -- sets is_deleted/deleted_by/deleted_at/delete_reason, never removes
// the row or its blob artefacts; there is no hard-delete path in the
// application (only the retention job hard-deletes). "Blocked entirely
// while legal hold is active" -- 409, the precise act a hold exists to
// prevent.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const ctx = await requireApiContext(request);
  if (ctx instanceof Response) return ctx;
  const { session, correlationId } = ctx;

  if (!canSoftDeleteTicket(session.user.role)) {
    return forbidden("Only ADMIN may delete a ticket");
  }
  if (!hasFreshStepUp(session)) {
    return forbidden("Step-up re-authentication required to delete a ticket");
  }

  const body = (await request.json().catch(() => ({}))) as Partial<Body>;
  if (typeof body.version !== "number") return badRequest("version is required for optimistic locking");
  if (!body.reason || !body.reason.trim()) return badRequest("reason is required to delete a ticket");

  const ticket = await prisma.ticket.findUnique({ where: { id: params.id } });
  if (!ticket || ticket.isDeleted) return notFound();

  if (ticket.isLegalHold) {
    return conflict("Cannot delete a ticket under legal hold -- clear the hold first if deletion is genuinely required", ticket);
  }

  const result = await prisma.ticket.updateMany({
    where: { id: ticket.id, version: body.version },
    data: {
      isDeleted: true,
      deletedById: session.user.id,
      deletedAt: new Date(),
      deleteReason: body.reason,
      version: { increment: 1 },
    },
  });
  if (result.count === 0) {
    const current = await prisma.ticket.findUnique({ where: { id: ticket.id } });
    return conflict("This ticket changed since it was loaded -- reload and retry", current);
  }

  await writeAuditLog({
    correlationId,
    actorId: session.user.id,
    action: "TICKET_SOFT_DELETED",
    entity: "ticket",
    entityId: ticket.id,
    ticketId: ticket.id,
    beforeJson: { isDeleted: false },
    afterJson: { isDeleted: true },
    reason: body.reason,
  });

  return NextResponse.json({ ok: true });
}
