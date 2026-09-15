import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiContext } from "@/lib/api-context";
import { badRequest, conflict, forbidden, notFound } from "@/lib/http-errors";
import { hasFreshStepUp } from "@/lib/session";
import { canSetOrClearConfidentialFlag } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";

interface Body {
  version: number;
  set: boolean;
}

// §9: "Settable by HR_LEAD or ADMIN only, at any point in the lifecycle
// ... Clearing the flag requires ADMIN with step-up re-authentication."
// Setting itself needs no step-up -- only the STEP_UP_REQUIRED_ACTIONS
// list (lib/rbac.ts) names "confidential flag clear," not "set."
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const ctx = await requireApiContext(request);
  if (ctx instanceof Response) return ctx;
  const { session, correlationId } = ctx;

  if (!canSetOrClearConfidentialFlag(session.user.role)) {
    return forbidden("Only HR_LEAD or ADMIN may set or clear the confidential flag");
  }

  const body = (await request.json().catch(() => ({}))) as Partial<Body>;
  if (typeof body.version !== "number") return badRequest("version is required for optimistic locking");
  if (typeof body.set !== "boolean") return badRequest("set (boolean) is required");

  if (!body.set) {
    if (session.user.role !== "ADMIN") {
      return forbidden("Only ADMIN may clear the confidential flag");
    }
    if (!hasFreshStepUp(session)) {
      return forbidden("Step-up re-authentication required to clear the confidential flag");
    }
  }

  const ticket = await prisma.ticket.findUnique({ where: { id: params.id } });
  if (!ticket || ticket.isDeleted) return notFound();

  const data = body.set
    ? { isConfidential: true, confidentialSetById: session.user.id, confidentialSetAt: new Date(), version: { increment: 1 } }
    : { isConfidential: false, version: { increment: 1 } };

  const result = await prisma.ticket.updateMany({ where: { id: ticket.id, version: body.version }, data });
  if (result.count === 0) {
    const current = await prisma.ticket.findUnique({ where: { id: ticket.id } });
    return conflict("This ticket changed since it was loaded -- reload and retry", current);
  }

  await writeAuditLog({
    correlationId,
    actorId: session.user.id,
    action: body.set ? "TICKET_CONFIDENTIAL_SET" : "TICKET_CONFIDENTIAL_CLEARED",
    entity: "ticket",
    entityId: ticket.id,
    ticketId: ticket.id,
    beforeJson: { isConfidential: ticket.isConfidential },
    afterJson: { isConfidential: body.set },
  });

  return NextResponse.json({ ticket: await prisma.ticket.findUnique({ where: { id: ticket.id } }) });
}
