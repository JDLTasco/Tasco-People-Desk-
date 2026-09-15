import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiContext } from "@/lib/api-context";
import { badRequest, conflict, forbidden, notFound } from "@/lib/http-errors";
import { hasFreshStepUp } from "@/lib/session";
import { validateReversal, type TicketStatus } from "@/lib/tickets/transitions";
import { writeAuditLog } from "@/lib/audit";
import { writeStatusHistory } from "@/lib/tickets/history";

interface Body {
  version: number;
  toStatus: TicketStatus;
  reason: string;
}

// §4: "Reversals. ADMIN only. Any backward move ... requires step-up
// re-authentication and a mandatory text reason, and writes to audit_log."
// An ARCHIVED ticket reversal is not reachable yet (archiving is Stage 6),
// but the reversal mechanism itself is general and works for any backward
// move already reachable today (e.g. CLOSED -> IN_ACTION).
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const ctx = await requireApiContext(request);
  if (ctx instanceof Response) return ctx;
  const { session, correlationId } = ctx;

  if (session.user.role !== "ADMIN") {
    return forbidden("Only ADMIN may reverse a status transition");
  }
  if (!hasFreshStepUp(session)) {
    return forbidden("Step-up re-authentication required for a status reversal");
  }

  const body = (await request.json().catch(() => ({}))) as Partial<Body>;
  if (typeof body.version !== "number") return badRequest("version is required for optimistic locking");
  if (!body.toStatus) return badRequest("toStatus is required");
  if (!body.reason || !body.reason.trim()) return badRequest("reason is required for a reversal");

  const ticket = await prisma.ticket.findUnique({ where: { id: params.id } });
  if (!ticket || ticket.isDeleted) return notFound();

  const check = validateReversal(ticket.status, body.toStatus, ticket.categoryId);
  if (!check.ok) return badRequest(check.error!);

  const result = await prisma.ticket.updateMany({
    where: { id: ticket.id, version: body.version },
    data: { status: body.toStatus, version: { increment: 1 } },
  });
  if (result.count === 0) {
    const current = await prisma.ticket.findUnique({ where: { id: ticket.id } });
    return conflict("This ticket changed since it was loaded -- reload and retry", current);
  }

  await writeStatusHistory({
    ticketId: ticket.id,
    fromStatus: ticket.status,
    toStatus: body.toStatus,
    actorId: session.user.id,
    reason: body.reason,
    correlationId,
  });
  await writeAuditLog({
    correlationId,
    actorId: session.user.id,
    action: "TICKET_STATUS_REVERSED",
    entity: "ticket",
    entityId: ticket.id,
    ticketId: ticket.id,
    beforeJson: { status: ticket.status },
    afterJson: { status: body.toStatus },
    reason: body.reason,
  });

  return NextResponse.json({ ticket: await prisma.ticket.findUnique({ where: { id: ticket.id } }) });
}
