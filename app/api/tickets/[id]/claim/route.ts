import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiContext } from "@/lib/api-context";
import { badRequest, conflict, notFound } from "@/lib/http-errors";
import { dueFieldsForPriorityChange, isPriority } from "@/lib/tickets/sla";
import { missingTargetFields } from "@/lib/tickets/target-due";
import { writeAuditLog } from "@/lib/audit";
import { writeStatusHistory } from "@/lib/tickets/history";

// §3: "Self-assign a pooled ticket -- ADMIN / HR_LEAD / HR_OFFICER" (any
// role may claim). §5: the literal atomic conditional UPDATE -- zero rows
// affected means someone else claimed it first, and that's a 409, never a
// read-then-write race.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const ctx = await requireApiContext(request);
  if (ctx instanceof Response) return ctx;
  const { session, correlationId } = ctx;

  const existing = await prisma.ticket.findUnique({ where: { id: params.id } });
  if (!existing || existing.isDeleted) return notFound();

  // Optional priority chosen at the moment of claiming (John, 2026-09-29) --
  // applied in the same atomic UPDATE, with sla_due_at (and the automatic
  // target due date) recalculated (§5).
  const body = (await request.json().catch(() => ({}))) as { priority?: unknown };
  if (body.priority !== undefined && !isPriority(body.priority)) return badRequest("priority must be P1, P2 or P3");
  const newPriority = isPriority(body.priority) && body.priority !== existing.priority ? body.priority : null;
  // A ticket with no target due date yet gets one now (2026-10-03).
  const fillTarget = newPriority ? {} : missingTargetFields(existing, existing.priority);

  const result = await prisma.ticket.updateMany({
    where: { id: params.id, assignedToId: null, status: "NEW" },
    data: {
      assignedToId: session.user.id,
      status: "ALLOCATED",
      assignedAt: new Date(),
      version: { increment: 1 },
      ...(newPriority ? { priority: newPriority, ...dueFieldsForPriorityChange(existing, newPriority) } : {}),
      ...fillTarget,
    },
  });

  if (result.count === 0) {
    const current = await prisma.ticket.findUnique({ where: { id: params.id } });
    return conflict("This ticket is no longer available to claim -- someone else may have claimed it", current);
  }

  await writeStatusHistory({
    ticketId: params.id,
    fromStatus: "NEW",
    toStatus: "ALLOCATED",
    fromAssignee: null,
    toAssignee: session.user.id,
    actorId: session.user.id,
    correlationId,
  });

  await writeAuditLog({
    correlationId,
    actorId: session.user.id,
    action: "TICKET_CLAIMED",
    entity: "ticket",
    entityId: params.id,
    ticketId: params.id,
    ...(newPriority ? { beforeJson: { priority: existing.priority } } : {}),
    afterJson: {
      assignedToId: session.user.id,
      status: "ALLOCATED",
      ...(newPriority ? { priority: newPriority } : {}),
      ...(fillTarget.targetDueAt ? { targetDueAt: fillTarget.targetDueAt.toISOString(), targetDueReason: fillTarget.targetDueReason } : {}),
    },
  });

  // No requester email here any more (operator amendment, John, 2026-10-03):
  // the acknowledgement email now goes out when the ticket is created
  // (lib/email/acknowledgement.ts), replacing §7.4's allocation email.
  const ticket = await prisma.ticket.findUnique({ where: { id: params.id } });
  return NextResponse.json({ ticket });
}
