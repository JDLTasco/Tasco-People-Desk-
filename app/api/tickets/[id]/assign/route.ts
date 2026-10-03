import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiContext } from "@/lib/api-context";
import { badRequest, conflict, forbidden, notFound } from "@/lib/http-errors";
import { canAssignPooledTicketToOthers, canReassignTicket } from "@/lib/rbac";
import { canViewerSeeTicket } from "@/lib/tickets/confidential-access";
import { validateReassignment } from "@/lib/tickets/transitions";
import { writeAuditLog } from "@/lib/audit";
import { writeStatusHistory } from "@/lib/tickets/history";
import { dueFieldsForPriorityChange, isPriority } from "@/lib/tickets/sla";
import { missingTargetFields } from "@/lib/tickets/target-due";

interface AssignBody {
  userId: string;
  version?: number;
  /** Pool assignment only: optional priority to set at the same time. */
  priority?: unknown;
}

// Covers both halves of §4/§3's assignment story:
//  - NEW -> ALLOCATED, assigning to someone else (self-claim is /claim).
//    Same atomic conditional UPDATE as self-claim, since it's racing the
//    exact same pool.
//  - Reassignment of an already-ALLOCATED/IN_ACTION ticket (not a status
//    transition -- §4's "events that are not transitions"). Optimistic
//    locking via `version`, per §5's general rule (this isn't the
//    unassigned-pool race the atomic UPDATE exists for).
// Operator amendment (John, 2026-10-03): every HR role may do both, on any
// ticket they can see (was: pool assignment HR_LEAD/ADMIN only, officers
// reassign their own tickets only -- §3). Confidential tickets still 404
// for anyone who can't see them.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const ctx = await requireApiContext(request);
  if (ctx instanceof Response) return ctx;
  const { session, correlationId } = ctx;

  const body = (await request.json()) as AssignBody;
  if (!body.userId) return badRequest("userId is required");

  const targetUser = await prisma.user.findUnique({ where: { id: body.userId } });
  if (!targetUser || !targetUser.isActive) return badRequest("Target user does not exist or is not active");

  const ticket = await prisma.ticket.findUnique({ where: { id: params.id }, include: { accessGrants: true } });
  if (!ticket || ticket.isDeleted) return notFound();
  if (!canViewerSeeTicket(session.user.role, session.user.id, ticket)) return notFound();

  if (ticket.status === "NEW" && ticket.assignedToId === null) {
    if (!canAssignPooledTicketToOthers(session.user.role)) {
      return forbidden("Not permitted to assign a pooled ticket to someone else");
    }

    // Optional priority chosen at the moment of assigning (John, 2026-09-29),
    // same as self-claim -- same atomic UPDATE, due dates recalculated (§5).
    if (body.priority !== undefined && !isPriority(body.priority)) return badRequest("priority must be P1, P2 or P3");
    const newPriority = isPriority(body.priority) && body.priority !== ticket.priority ? body.priority : null;
    // A ticket with no target due date yet gets one now (2026-10-03).
    const fillTarget = newPriority ? {} : missingTargetFields(ticket, ticket.priority);

    const result = await prisma.ticket.updateMany({
      where: { id: ticket.id, assignedToId: null, status: "NEW" },
      data: {
        assignedToId: body.userId,
        status: "ALLOCATED",
        assignedAt: new Date(),
        version: { increment: 1 },
        ...(newPriority ? { priority: newPriority, ...dueFieldsForPriorityChange(ticket, newPriority) } : {}),
        ...fillTarget,
      },
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
      ...(newPriority ? { beforeJson: { priority: ticket.priority } } : {}),
      afterJson: {
        assignedToId: body.userId,
        status: "ALLOCATED",
        ...(newPriority ? { priority: newPriority } : {}),
        ...(fillTarget.targetDueAt ? { targetDueAt: fillTarget.targetDueAt.toISOString(), targetDueReason: fillTarget.targetDueReason } : {}),
      },
    });

    // No allocation email any more (2026-10-03) -- the requester got an
    // acknowledgement when the ticket was created.

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
  // the new assignee internally." The requester side is correctly a no-op
  // (confirmed: reassignment never calls sendAllocationEmail). The internal
  // notification to the new assignee has no defined channel or content
  // anywhere in the spec -- §7.4's table names exactly three outbound
  // triggers (Allocation/Outcome/SLA escalation), none of which is this.
  // Left deferred rather than invented; the DB-level reassignment itself
  // is complete and correct.
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
