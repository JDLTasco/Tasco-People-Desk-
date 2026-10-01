import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiContext } from "@/lib/api-context";
import { badRequest, conflict, forbidden, notFound } from "@/lib/http-errors";
import { isWorkingStatus } from "@/lib/tickets/transitions";
import { canViewerSeeTicket } from "@/lib/tickets/confidential-access";
import { writeAuditLog } from "@/lib/audit";
import { writeStatusHistory } from "@/lib/tickets/history";
import { renderRequesterQuestionEmail } from "@/lib/email/templates";
import { sendTicketEmail } from "@/lib/email/send";
import { threadingForTicket } from "@/lib/email/threading";

interface QuestionBody {
  version: number;
  question: string;
  ccRecipients?: string[];
}

// Operator addition (John, 2026-10-01): email the requester a question
// mid-investigation. Same people as outcome dispatch (assignee/HR_LEAD/
// ADMIN), from any working status, and the ticket moves to
// AWAITING_RESPONSE (stays there if it already is). Same ordering as the
// outcome route: the status change is applied first under optimistic
// locking, then the email is attempted; a failed send is recorded and
// bannered, not rolled back.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const ctx = await requireApiContext(request);
  if (ctx instanceof Response) return ctx;
  const { session, correlationId } = ctx;

  const body = (await request.json().catch(() => ({}))) as Partial<QuestionBody>;
  if (typeof body.version !== "number") {
    return badRequest("version is required for optimistic locking");
  }
  const question = body.question?.trim();
  if (!question) return badRequest("question is required");

  const ticket = await prisma.ticket.findUnique({ where: { id: params.id }, include: { accessGrants: true } });
  if (!ticket || ticket.isDeleted) return notFound();
  if (!canViewerSeeTicket(session.user.role, session.user.id, ticket)) return notFound();

  const isAssignee = ticket.assignedToId === session.user.id;
  if (!(session.user.role === "ADMIN" || session.user.role === "HR_LEAD" || isAssignee)) {
    return forbidden("Only the assignee, HR_LEAD, or ADMIN may email the requester");
  }
  if (!isWorkingStatus(ticket.status)) {
    return badRequest(`A question can only be sent while the ticket is in action (current status: ${ticket.status})`);
  }

  const ccRecipients = body.ccRecipients ?? ticket.ccRecipients;

  const result = await prisma.ticket.updateMany({
    where: { id: ticket.id, version: body.version },
    data: { status: "AWAITING_RESPONSE", version: { increment: 1 } },
  });
  if (result.count === 0) {
    const current = await prisma.ticket.findUnique({ where: { id: ticket.id } });
    return conflict("This ticket changed since it was loaded -- reload and retry", current);
  }

  if (ticket.status !== "AWAITING_RESPONSE") {
    await writeStatusHistory({
      ticketId: ticket.id,
      fromStatus: ticket.status,
      toStatus: "AWAITING_RESPONSE",
      actorId: session.user.id,
      reason: "Question emailed to requester",
      correlationId,
    });
  }

  const rendered = renderRequesterQuestionEmail({ ticketNo: ticket.ticketNo, displaySubject: ticket.subject, question });
  const sendResult = await sendTicketEmail({
    ticketId: ticket.id,
    messageType: "REQUESTER_QUESTION",
    toRecipients: [ticket.requesterEmail],
    ccRecipients,
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
    action: "TICKET_REQUESTER_QUESTION_SENT",
    entity: "ticket",
    entityId: ticket.id,
    ticketId: ticket.id,
    beforeJson: { status: ticket.status },
    afterJson: {
      status: "AWAITING_RESPONSE",
      question,
      ccRecipients,
      emailSent: sendResult.ok,
      emailAttempts: sendResult.attempts,
    },
  });

  return NextResponse.json({
    ticket: await prisma.ticket.findUnique({ where: { id: ticket.id } }),
    emailSent: sendResult.ok,
  });
}
