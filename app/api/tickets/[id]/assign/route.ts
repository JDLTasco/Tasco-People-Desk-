import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiContext } from "@/lib/api-context";
import { badRequest, conflict, forbidden, notFound } from "@/lib/http-errors";
import { canReassignTicket } from "@/lib/rbac";
import { validateReassignment } from "@/lib/tickets/transitions";
import { writeAuditLog } from "@/lib/audit";
import { writeStatusHistory } from "@/lib/tickets/history";

interface AssignBody {
  userId: string;
  version?: number;
}

// Covers both halves of §4/§3's assignment story:
//  - NEW -> ALLOCATED, assigning to someone else (HR_LEAD/ADMIN only --
//    any-user self-claim is /claim). Same atomic conditional UPDATE as
//    self-claim, since it's racing the exact same pool.
//  - Reassignment of an already-ALLOCATED/IN_ACTION ticket (not a status
//    transition -- §4's "events that are not transitions"). HR_OFFICER may
//    only reassign a ticket currently assigned to them (§3: "Own tickets
//    only"); ADMIN/HR_LEAD may reassign anyone's ticket. Optimistic
//    locking via `version`, per §5's general rule (this isn't the
//    unassigned-pool race the atomic UPDATE exists for).
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const ctx = await requireApiContext(request);
  if (ctx instanceof Response) return ctx;
  const { session, correlationId } = ctx;

  const body = (await request.json()) as AssignBody;
  if (!body.userId) return badRequest("userId is required");

  const targetUser = await prisma.user.findUnique({ where: { id: body.userId } });
  if (!targetUser || !targetUser.isActive) return badRequest("Target user does not exist or is not active");

  const ticket = await prisma.ticket.findUnique({ where: { id: params.id } });
  if (!ticket || ticket.isDeleted) return notFound();

  if (ticket.status === "NEW" && ticket.assignedToId === null) {
    if (!(session.user.role === "ADMIN" || session.user.role === "HR_LEAD")) {
      return forbidden("Only HR_LEAD or ADMIN may assign a pooled ticket to someone else");
    }

    const result = await prisma.ticket.updateMany({
      where: { id: ticket.id, assignedToId: null, status: "NEW" },
      data: { assignedToId: body.userId, status: "ALLOCATED", assignedAt: new Date(), version: { increment: 1 } },
    });
    if (result.count === 0) {
      const current = await prisma.ticket.findUnique({ where: { id: ticket.id } });
      return conflict("This ticket is no longer available -- it may already have been claimed", current);
    }

    await writeStatusHistory({
      ticketId: ticket.id,
      fromStatus: "NEW",
      toStatus: "ALLOCATED",
      fromAssignee: null,
      toAssignee: body.userId,
      actorId: session.user.id,
      correlationId,
    });
    await writeAuditLog({
      correlationId,
      actorId: session.user.id,
      action: "TICKET_ASSIGNED",
      entity: "ticket",
      entityId: ticket.id,
      ticketId: ticket.id,
      afterJson: { assignedToId: body.userId, status: "ALLOCATED" },
    });

    return NextResponse.json({ ticket: await prisma.ticket.findUnique({ where: { id: ticket.id } }) });
  }

  // Reassignment path.
  const reassignmentCheck = validateReassignment(ticket.status);
  if (!reassignmentCheck.ok) {
    return badRequest(reassignmentCheck.error!);
  }

  const isOwnTicket = ticket.assignedToId === session.user.id;
  if (!canReassignTicket(session.user.role, isOwnTicket)) {
    return forbidden("Not permitted to reassign this ticket");
  }

  if (typeof body.version !== "number") {
    return badRequest("version is required for optimistic locking");
  }

  const result = await prisma.ticket.updateMany({
    where: { id: ticket.id, version: body.version },
    data: { assignedToId: body.userId, version: { increment: 1 } },
  });
  if (result.count === 0) {
    const current = await prisma.ticket.findUnique({ where: { id: ticket.id } });
    return conflict("This ticket changed since it was loaded -- reload and retry", current);
  }

  // §4: "Does not re-send the allocation email to the requester; notifies
  // the new assignee internally." Neither notification exists yet --
  // outbound email is Stage 5. The DB-level reassignment itself is
  // complete and correct now; the internal notification is deferred.
  await writeStatusHistory({
    ticketId: ticket.id,
    fromStatus: ticket.status,
    toStatus: ticket.status,
    fromAssignee: ticket.assignedToId,
    toAssignee: body.userId,
    actorId: session.user.id,
    correlationId,
  });
  await writeAuditLog({
    correlationId,
    actorId: session.user.id,
    action: "TICKET_REASSIGNED",
    entity: "ticket",
    entityId: ticket.id,
    ticketId: ticket.id,
    beforeJson: { assignedToId: ticket.assignedToId },
    afterJson: { assignedToId: body.userId },
  });

  return NextResponse.json({ ticket: await prisma.ticket.findUnique({ where: { id: ticket.id } }) });
}
