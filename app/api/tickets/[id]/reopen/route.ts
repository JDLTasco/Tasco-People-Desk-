import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiContext } from "@/lib/api-context";
import { badRequest, conflict, notFound } from "@/lib/http-errors";
import { canViewerSeeTicket } from "@/lib/tickets/confidential-access";
import { reopenTargetStatus, validateReopen } from "@/lib/tickets/reopen";
import { writeAuditLog } from "@/lib/audit";
import { writeStatusHistory } from "@/lib/tickets/history";

interface Body {
  version: number;
  reason: string;
}

// Operator addition (John, 2026-09-29): any HR staff member may reopen a
// CLOSED ticket within 30 days of closure, with a mandatory reason -- see
// lib/tickets/reopen.ts for the window and where the ticket lands. Unlike
// the ADMIN-only reversal, no step-up is needed.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const ctx = await requireApiContext(request);
  if (ctx instanceof Response) return ctx;
  const { session, correlationId } = ctx;

  const body = (await request.json().catch(() => ({}))) as Partial<Body>;
  if (typeof body.version !== "number") return badRequest("version is required for optimistic locking");
  if (!body.reason || !body.reason.trim()) return badRequest("A reason is required to reopen a ticket");

  const ticket = await prisma.ticket.findUnique({ where: { id: params.id }, include: { accessGrants: true } });
  if (!ticket || ticket.isDeleted) return notFound();
  if (!canViewerSeeTicket(session.user.role, session.user.id, ticket)) return notFound();

  const check = validateReopen(ticket);
  if (!check.ok) return badRequest(check.error!);

  const toStatus = reopenTargetStatus(ticket);
  const result = await prisma.ticket.updateMany({
    where: { id: ticket.id, version: body.version },
    data: { status: toStatus, closeReason: null, closedAt: null, version: { increment: 1 } },
  });
  if (result.count === 0) {
    const current = await prisma.ticket.findUnique({ where: { id: ticket.id } });
    return conflict("This ticket changed since it was loaded -- reload and retry", current);
  }

  await writeStatusHistory({
    ticketId: ticket.id,
    fromStatus: ticket.status,
    toStatus,
    actorId: session.user.id,
    reason: body.reason,
    correlationId,
  });
  await writeAuditLog({
    correlationId,
    actorId: session.user.id,
    action: "TICKET_REOPENED",
    entity: "ticket",
    entityId: ticket.id,
    ticketId: ticket.id,
    beforeJson: { status: ticket.status, closeReason: ticket.closeReason, closedAt: ticket.closedAt?.toISOString() ?? null },
    afterJson: { status: toStatus },
    reason: body.reason,
  });

  return NextResponse.json({ ticket: await prisma.ticket.findUnique({ where: { id: ticket.id } }) });
}
