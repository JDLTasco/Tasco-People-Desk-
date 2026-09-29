import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiContext } from "@/lib/api-context";
import { badRequest, conflict, forbidden, notFound } from "@/lib/http-errors";
import { validateTransition } from "@/lib/tickets/transitions";
import { canViewerSeeTicket } from "@/lib/tickets/confidential-access";
import { writeAuditLog } from "@/lib/audit";
import { writeStatusHistory } from "@/lib/tickets/history";

type ResponseTarget = "AWAITING_RESPONSE" | "RESPONSE_RECEIVED" | "IN_ACTION";

interface ResponseStatusBody {
  version: number;
  toStatus: ResponseTarget;
  /** Mandatory for RESPONSE_RECEIVED -- what the requester said. Saved as an internal note. */
  note?: string;
}

const TARGETS: ResponseTarget[] = ["AWAITING_RESPONSE", "RESPONSE_RECEIVED", "IN_ACTION"];

// Operator amendment (John, 2026-09-29): the IN_ACTION response sub-steps.
// Typical case: the assignee marks AWAITING_RESPONSE after asking the
// requester something; the requester phones back and whoever answers --
// any staff member -- records what was said and marks RESPONSE_RECEIVED,
// which raises an in-app alert for the assignee. Also used to move back
// to plain IN_ACTION (assignee/HR_LEAD/ADMIN, enforced in transitions.ts).
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const ctx = await requireApiContext(request);
  if (ctx instanceof Response) return ctx;
  const { session, correlationId } = ctx;

  const body = (await request.json().catch(() => ({}))) as Partial<ResponseStatusBody>;
  if (typeof body.version !== "number") {
    return badRequest("version is required for optimistic locking");
  }
  if (!body.toStatus || !TARGETS.includes(body.toStatus)) {
    return badRequest(`toStatus must be one of ${TARGETS.join(", ")}`);
  }
  const noteText = body.note?.trim() ?? "";
  if (body.toStatus === "RESPONSE_RECEIVED" && !noteText) {
    return badRequest("A note describing the response is required when marking a response received");
  }

  const ticket = await prisma.ticket.findUnique({ where: { id: params.id }, include: { accessGrants: true } });
  if (!ticket || ticket.isDeleted) return notFound();
  if (!canViewerSeeTicket(session.user.role, session.user.id, ticket)) return notFound();

  const isAssignee = ticket.assignedToId === session.user.id;
  const check = validateTransition(ticket.status, body.toStatus, {
    actorRole: session.user.role,
    isAssignee,
    categoryId: ticket.categoryId,
  });
  if (!check.ok) {
    return check.status === 403 ? forbidden(check.error) : badRequest(check.error!);
  }

  // Alert the assignee only when someone else recorded the response --
  // no point alerting an officer about their own action.
  const raiseAlert = body.toStatus === "RESPONSE_RECEIVED" && ticket.assignedToId !== null && !isAssignee;

  const result = await prisma.ticket.updateMany({
    where: { id: ticket.id, version: body.version },
    data: {
      status: body.toStatus,
      version: { increment: 1 },
      ...(raiseAlert ? { responseAlertPending: true } : {}),
    },
  });
  if (result.count === 0) {
    const current = await prisma.ticket.findUnique({ where: { id: ticket.id } });
    return conflict("This ticket changed since it was loaded -- reload and retry", current);
  }

  if (noteText) {
    const note = await prisma.ticketNote.create({
      data: { ticketId: ticket.id, authorId: session.user.id, body: noteText, visibility: "INTERNAL" },
    });
    await writeAuditLog({
      correlationId,
      actorId: session.user.id,
      action: "TICKET_NOTE_CREATED",
      entity: "ticket_note",
      entityId: note.id,
      ticketId: ticket.id,
      afterJson: { body: note.body, visibility: note.visibility },
    });
  }

  await writeStatusHistory({
    ticketId: ticket.id,
    fromStatus: ticket.status,
    toStatus: body.toStatus,
    actorId: session.user.id,
    correlationId,
  });
  await writeAuditLog({
    correlationId,
    actorId: session.user.id,
    action: "TICKET_STATUS_CHANGED",
    entity: "ticket",
    entityId: ticket.id,
    ticketId: ticket.id,
    beforeJson: { status: ticket.status },
    afterJson: { status: body.toStatus, ...(raiseAlert ? { responseAlertPending: true } : {}) },
  });

  return NextResponse.json({ ticket: await prisma.ticket.findUnique({ where: { id: ticket.id } }) });
}
