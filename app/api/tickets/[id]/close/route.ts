import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiContext } from "@/lib/api-context";
import { badRequest, conflict, forbidden, notFound } from "@/lib/http-errors";
import { validateTransition } from "@/lib/tickets/transitions";
import { writeAuditLog } from "@/lib/audit";
import { writeStatusHistory } from "@/lib/tickets/history";

interface Body {
  version: number;
}

// §4: OUTCOME -> CLOSED, "matter resolved," sets closed_at. Reachable in
// practice only once a ticket has gone through the Stage 5 dispatch-preview
// flow to reach OUTCOME in the first place -- that flow doesn't exist yet,
// so this route is exercised against fixture data for now, not real
// traffic. Built now because the transition itself has no dependency on
// email being sent (§4's own table lists no guard here beyond role).
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const ctx = await requireApiContext(request);
  if (ctx instanceof Response) return ctx;
  const { session, correlationId } = ctx;

  const body = (await request.json().catch(() => ({}))) as Partial<Body>;
  if (typeof body.version !== "number") {
    return badRequest("version is required for optimistic locking");
  }

  const ticket = await prisma.ticket.findUnique({ where: { id: params.id } });
  if (!ticket || ticket.isDeleted) return notFound();

  const check = validateTransition(ticket.status, "CLOSED", {
    actorRole: session.user.role,
    isAssignee: ticket.assignedToId === session.user.id,
    categoryId: ticket.categoryId,
  });
  if (!check.ok) {
    return check.status === 403 ? forbidden(check.error) : badRequest(check.error!);
  }

  const result = await prisma.ticket.updateMany({
    where: { id: ticket.id, version: body.version },
    data: { status: "CLOSED", closeReason: "RESOLVED", closedAt: new Date(), version: { increment: 1 } },
  });
  if (result.count === 0) {
    const current = await prisma.ticket.findUnique({ where: { id: ticket.id } });
    return conflict("This ticket changed since it was loaded -- reload and retry", current);
  }

  await writeStatusHistory({
    ticketId: ticket.id,
    fromStatus: ticket.status,
    toStatus: "CLOSED",
    actorId: session.user.id,
    correlationId,
  });
  await writeAuditLog({
    correlationId,
    actorId: session.user.id,
    action: "TICKET_CLOSED",
    entity: "ticket",
    entityId: ticket.id,
    ticketId: ticket.id,
    beforeJson: { status: ticket.status },
    afterJson: { status: "CLOSED", closeReason: "RESOLVED" },
  });

  return NextResponse.json({ ticket: await prisma.ticket.findUnique({ where: { id: ticket.id } }) });
}
