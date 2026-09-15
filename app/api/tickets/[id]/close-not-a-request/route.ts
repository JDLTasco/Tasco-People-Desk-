import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiContext } from "@/lib/api-context";
import { badRequest, conflict, notFound } from "@/lib/http-errors";
import { validateNotARequestClose } from "@/lib/tickets/transitions";
import { writeAuditLog } from "@/lib/audit";
import { writeStatusHistory } from "@/lib/tickets/history";

interface Body {
  version: number;
}

// §4: "Not a request" close -- available from NEW, ALLOCATED, or IN_ACTION.
// Any role. Bypasses all requester notifications (there's no outbound
// email yet regardless -- Stage 5), requires no category, and is excluded
// from the default archive search view (Stage 6's own concern once
// archiving exists).
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

  const check = validateNotARequestClose(ticket.status);
  if (!check.ok) return badRequest(check.error!);

  const result = await prisma.ticket.updateMany({
    where: { id: ticket.id, version: body.version },
    data: { status: "CLOSED", closeReason: "NOT_A_REQUEST", closedAt: new Date(), version: { increment: 1 } },
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
    action: "TICKET_CLOSED_NOT_A_REQUEST",
    entity: "ticket",
    entityId: ticket.id,
    ticketId: ticket.id,
    beforeJson: { status: ticket.status },
    afterJson: { status: "CLOSED", closeReason: "NOT_A_REQUEST" },
  });

  return NextResponse.json({ ticket: await prisma.ticket.findUnique({ where: { id: ticket.id } }) });
}
