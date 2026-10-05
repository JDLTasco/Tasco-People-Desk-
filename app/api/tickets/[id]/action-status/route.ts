import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiContext } from "@/lib/api-context";
import { badRequest, conflict, forbidden, notFound } from "@/lib/http-errors";
import { canViewerSeeTicket } from "@/lib/tickets/confidential-access";
import { validateActionStatusChange } from "@/lib/tickets/action-status";
import { writeAuditLog } from "@/lib/audit";
import { writeStatusHistory } from "@/lib/tickets/history";

interface ActionStatusBody {
  version: number;
  /** The action item to set, or null to clear the current one. */
  actionStatusId: string | null;
  /**
   * Required when setting an action item (e.g. why it's On Hold -- John,
   * 2026-10-05, same as Response received's note); optional when clearing.
   * Recorded in status history and saved as an internal note.
   */
  reason?: string;
}

// Action items (operator addition, John 2026-10-01) -- see
// lib/tickets/action-status.ts for who may set/clear one and when.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const ctx = await requireApiContext(request);
  if (ctx instanceof Response) return ctx;
  const { session, correlationId } = ctx;

  const body = (await request.json().catch(() => ({}))) as Partial<ActionStatusBody>;
  if (typeof body.version !== "number") {
    return badRequest("version is required for optimistic locking");
  }
  if (body.actionStatusId !== null && typeof body.actionStatusId !== "string") {
    return badRequest("actionStatusId must be an action item id, or null to clear");
  }
  const targetId = body.actionStatusId;
  const reason = body.reason?.trim() || undefined;
  if (targetId && !reason) {
    return badRequest("A reason is required when setting an action item (e.g. why the ticket is on hold)");
  }

  const ticket = await prisma.ticket.findUnique({
    where: { id: params.id },
    include: { accessGrants: true, actionStatus: true },
  });
  if (!ticket || ticket.isDeleted) return notFound();
  if (!canViewerSeeTicket(session.user.role, session.user.id, ticket)) return notFound();

  const target = targetId ? await prisma.actionStatus.findUnique({ where: { id: targetId } }) : null;
  if (targetId && (!target || !target.isActive)) {
    return badRequest("That action item doesn't exist or has been deactivated");
  }

  const check = validateActionStatusChange({
    status: ticket.status,
    currentActionStatusId: ticket.actionStatusId,
    targetActionStatusId: targetId,
    actorRole: session.user.role,
    isAssignee: ticket.assignedToId === session.user.id,
    categoryId: ticket.categoryId,
  });
  if (!check.ok) {
    return check.status === 403 ? forbidden(check.error) : badRequest(check.error!);
  }

  const result = await prisma.ticket.updateMany({
    where: { id: ticket.id, version: body.version },
    data: { status: "IN_ACTION", actionStatusId: targetId, version: { increment: 1 } },
  });
  if (result.count === 0) {
    const current = await prisma.ticket.findUnique({ where: { id: ticket.id } });
    return conflict("This ticket changed since it was loaded -- reload and retry", current);
  }

  const label = target ? `Action item: ${target.name}` : `Action item cleared: ${ticket.actionStatus?.name ?? ""}`;
  if (target && reason) {
    const note = await prisma.ticketNote.create({
      data: { ticketId: ticket.id, authorId: session.user.id, body: `${target.name}: ${reason}`, visibility: "INTERNAL" },
    });
    await writeAuditLog({
      correlationId,
      actorId: session.user.id,
      action: "TICKET_NOTE_CREATED",
      entity: "ticket_note",
      entityId: note.id,
      ticketId: ticket.id,
      afterJson: { body: note.body, visibility: note.visibility },
    });
  }
  await writeStatusHistory({
    ticketId: ticket.id,
    fromStatus: ticket.status,
    toStatus: "IN_ACTION",
    actorId: session.user.id,
    reason: reason ? `${label} -- ${reason}` : label,
    correlationId,
  });
  await writeAuditLog({
    correlationId,
    actorId: session.user.id,
    action: "TICKET_ACTION_STATUS_CHANGED",
    entity: "ticket",
    entityId: ticket.id,
    ticketId: ticket.id,
    beforeJson: { status: ticket.status, actionStatus: ticket.actionStatus?.name ?? null },
    afterJson: { status: "IN_ACTION", actionStatus: target?.name ?? null },
    reason,
  });

  return NextResponse.json({ ticket: await prisma.ticket.findUnique({ where: { id: ticket.id } }) });
}
