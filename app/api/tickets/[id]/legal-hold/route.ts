import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiContext } from "@/lib/api-context";
import { badRequest, conflict, forbidden, notFound } from "@/lib/http-errors";
import { hasFreshStepUp } from "@/lib/session";
import { canSetOrClearLegalHold } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";

interface Body {
  version: number;
  set: boolean;
  reason?: string;
}

// §10 "Legal hold": ADMIN only. Setting AND clearing both require
// step-up re-authentication and a mandatory text reason, and are
// audit-logged with before and after state. "A hold may be placed on a
// ticket at any lifecycle stage, including ARCHIVED" -- no status guard
// here at all, deliberately.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const ctx = await requireApiContext(request);
  if (ctx instanceof Response) return ctx;
  const { session, correlationId } = ctx;

  if (!canSetOrClearLegalHold(session.user.role)) {
    return forbidden("Only ADMIN may set or clear a legal hold");
  }
  if (!hasFreshStepUp(session)) {
    return forbidden("Step-up re-authentication required to set or clear a legal hold");
  }

  const body = (await request.json().catch(() => ({}))) as Partial<Body>;
  if (typeof body.version !== "number") return badRequest("version is required for optimistic locking");
  if (typeof body.set !== "boolean") return badRequest("set (boolean) is required");
  if (!body.reason || !body.reason.trim()) return badRequest("reason is required to set or clear a legal hold");

  const ticket = await prisma.ticket.findUnique({ where: { id: params.id } });
  if (!ticket || ticket.isDeleted) return notFound();

  const data = body.set
    ? {
        isLegalHold: true,
        legalHoldReason: body.reason,
        legalHoldSetById: session.user.id,
        legalHoldSetAt: new Date(),
        legalHoldClearedById: null,
        legalHoldClearedAt: null,
        version: { increment: 1 },
      }
    : {
        isLegalHold: false,
        legalHoldClearedById: session.user.id,
        legalHoldClearedAt: new Date(),
        version: { increment: 1 },
      };

  const result = await prisma.ticket.updateMany({ where: { id: ticket.id, version: body.version }, data });
  if (result.count === 0) {
    const current = await prisma.ticket.findUnique({ where: { id: ticket.id } });
    return conflict("This ticket changed since it was loaded -- reload and retry", current);
  }

  await writeAuditLog({
    correlationId,
    actorId: session.user.id,
    action: body.set ? "TICKET_LEGAL_HOLD_SET" : "TICKET_LEGAL_HOLD_CLEARED",
    entity: "ticket",
    entityId: ticket.id,
    ticketId: ticket.id,
    beforeJson: { isLegalHold: ticket.isLegalHold, legalHoldReason: ticket.legalHoldReason },
    afterJson: { isLegalHold: body.set, legalHoldReason: body.set ? body.reason : null },
    reason: body.reason,
  });

  return NextResponse.json({ ticket: await prisma.ticket.findUnique({ where: { id: ticket.id } }) });
}
