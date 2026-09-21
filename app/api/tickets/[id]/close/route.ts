import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiContext } from "@/lib/api-context";
import { badRequest, conflict, forbidden, notFound } from "@/lib/http-errors";
import { validateTransition } from "@/lib/tickets/transitions";
import { writeAuditLog } from "@/lib/audit";
import { writeStatusHistory } from "@/lib/tickets/history";
import { renderClosedResolvedEmail } from "@/lib/email/templates";
import { sendTicketEmail } from "@/lib/email/send";
import { threadingForTicket } from "@/lib/email/threading";

interface Body {
  version: number;
}

// §4: OUTCOME -> CLOSED, "matter resolved," sets closed_at. Added directly
// with John, 2026-09-21 (not in the original spec): also sends a short
// standardised closing-confirmation email to the requester + cc_recipients
// -- distinct from the OUTCOME email, which already carried the actual
// resolution content sent when the ticket moved IN_ACTION -> OUTCOME. Same
// posture as every other outbound send in this app: applied to the DB
// first via optimistic locking, and only once that succeeds does the email
// attempt happen; a delivery failure is a recorded, bannered outcome (see
// lib/email/send.ts), never a reason to roll the closure back.
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

  const rendered = renderClosedResolvedEmail({ ticketNo: ticket.ticketNo, displaySubject: ticket.subject });
  const sendResult = await sendTicketEmail({
    ticketId: ticket.id,
    messageType: "CLOSED_RESOLVED",
    toRecipients: [ticket.requesterEmail],
    ccRecipients: ticket.ccRecipients,
    subject: rendered.subject,
    bodyText: rendered.bodyText,
    bodyHtml: rendered.bodyHtml,
    correlationId,
    sentById: session.user.id,
    threading: await threadingForTicket(ticket.id),
  });

  await writeAuditLog({
    correlationId,
    actorId: session.user.id,
    action: "TICKET_CLOSED",
    entity: "ticket",
    entityId: ticket.id,
    ticketId: ticket.id,
    beforeJson: { status: ticket.status },
    afterJson: { status: "CLOSED", closeReason: "RESOLVED", emailSent: sendResult.ok, emailAttempts: sendResult.attempts },
  });

  return NextResponse.json({
    ticket: await prisma.ticket.findUnique({ where: { id: ticket.id } }),
    emailSent: sendResult.ok,
  });
}
