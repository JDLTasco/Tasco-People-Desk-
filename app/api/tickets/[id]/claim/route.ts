import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiContext } from "@/lib/api-context";
import { conflict, notFound } from "@/lib/http-errors";
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

  const result = await prisma.ticket.updateMany({
    where: { id: params.id, assignedToId: null, status: "NEW" },
    data: {
      assignedToId: session.user.id,
      status: "ALLOCATED",
      assignedAt: new Date(),
      version: { increment: 1 },
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
    afterJson: { assignedToId: session.user.id, status: "ALLOCATED" },
  });

  const ticket = await prisma.ticket.findUnique({ where: { id: params.id } });
  return NextResponse.json({ ticket });
}
