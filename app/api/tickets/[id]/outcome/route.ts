import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiContext } from "@/lib/api-context";
import { badRequest, conflict, forbidden, notFound } from "@/lib/http-errors";
import { validateTransition } from "@/lib/tickets/transitions";
import { writeAuditLog } from "@/lib/audit";
import { writeStatusHistory } from "@/lib/tickets/history";
import { renderOutcomeEmail } from "@/lib/email/templates";
import { sendTicketEmail } from "@/lib/email/send";
import { threadingForTicket } from "@/lib/email/threading";
import { TICKET_DETAIL_INCLUDE } from "@/lib/tickets/detail";

interface OutcomeBody {
  version: number;
  outcomeForRequester: string;
  ccRecipients?: string[];
  requesterVisibleNoteIds?: string[];
}

// §7.4 "Outcome dispatch preview -- mandatory": the ONLY path from
// IN_ACTION to OUTCOME. validateTransition() refuses this transition from
// anywhere else (viaDispatchPreview must be explicitly set here -- see its
// own doc comment). The transition itself is applied first, atomically
// via optimistic locking, and only once that succeeds does the email
// attempt happen -- never the other way around, which could send a real
// outcome email for a transition that then fails to apply. A delivery
// failure after that point does not roll the transition back (§7.4's own
// "retry three times... then surface as a banner" model already treats
// delivery failure as a recorded, bannered outcome, not a blocking one --
// same posture as the allocation email, which plainly can't block
// NEW -> ALLOCATED either).
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const ctx = await requireApiContext(request);
  if (ctx instanceof Response) return ctx;
  const { session, correlationId } = ctx;

  const body = (await request.json().catch(() => ({}))) as Partial<OutcomeBody>;
  if (typeof body.version !== "number") {
    return badRequest("version is required for optimistic locking");
  }
  if (!body.outcomeForRequester || !body.outcomeForRequester.trim()) {
    return badRequest("outcomeForRequester is required");
  }

  const ticket = await prisma.ticket.findUnique({ where: { id: params.id } });
  if (!ticket || ticket.isDeleted) return notFound();

  const check = validateTransition(ticket.status, "OUTCOME", {
    actorRole: session.user.role,
    isAssignee: ticket.assignedToId === session.user.id,
    categoryId: ticket.categoryId,
    viaDispatchPreview: true,
  });
  if (!check.ok) {
    return check.status === 403 ? forbidden(check.error) : badRequest(check.error!);
  }

  const finalCcRecipients = body.ccRecipients ?? ticket.ccRecipients;

  // Never trust client-supplied note bodies -- re-fetch and filter server-side
  // so only genuinely current, REQUESTER_VISIBLE notes on THIS ticket can
  // ever reach a requester's inbox, regardless of what ids were posted.
  const includedNotes = body.requesterVisibleNoteIds?.length
    ? await prisma.ticketNote.findMany({
        where: { id: { in: body.requesterVisibleNoteIds }, ticketId: ticket.id, visibility: "REQUESTER_VISIBLE", isCurrent: true },
        orderBy: { createdAt: "asc" },
      })
    : [];

  const result = await prisma.ticket.updateMany({
    where: { id: ticket.id, version: body.version },
    data: {
      status: "OUTCOME",
      outcomeForRequester: body.outcomeForRequester,
      outcomeSentAt: new Date(),
      ccRecipients: finalCcRecipients,
      version: { increment: 1 },
    },
  });
  if (result.count === 0) {
    const current = await prisma.ticket.findUnique({ where: { id: ticket.id } });
    return conflict("This ticket changed since it was loaded -- reload and retry", current);
  }

  await writeStatusHistory({
    ticketId: ticket.id,
    fromStatus: ticket.status,
    toStatus: "OUTCOME",
    actorId: session.user.id,
    correlationId,
  });

  const rendered = renderOutcomeEmail({
    ticketNo: ticket.ticketNo,
    displaySubject: ticket.subject,
    outcomeForRequester: body.outcomeForRequester,
    includedNotes: includedNotes.map((n) => ({ body: n.body })),
  });

  const sendResult = await sendTicketEmail({
    ticketId: ticket.id,
    messageType: "OUTCOME",
    toRecipients: [ticket.requesterEmail],
    ccRecipients: finalCcRecipients,
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
    action: "TICKET_OUTCOME_SENT",
    entity: "ticket",
    entityId: ticket.id,
    ticketId: ticket.id,
    beforeJson: { status: ticket.status },
    afterJson: {
      status: "OUTCOME",
      outcomeForRequester: body.outcomeForRequester,
      includedNoteIds: includedNotes.map((n) => n.id),
      emailSent: sendResult.ok,
      emailAttempts: sendResult.attempts,
    },
  });

  const updated = await prisma.ticket.findUnique({ where: { id: ticket.id }, include: TICKET_DETAIL_INCLUDE });
  return NextResponse.json({ ticket: updated, emailSent: sendResult.ok });
}
