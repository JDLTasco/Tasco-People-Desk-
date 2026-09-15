import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkJobKey } from "@/lib/jobs/auth";
import { runJob } from "@/lib/jobs/run";
import { isOverdue, effectiveDueDate, breachedDeadline } from "@/lib/tickets/due-dates";
import { getSystemUserId } from "@/lib/ingestion/process-message";
import { renderEscalationEmail } from "@/lib/email/templates";
import { sendTicketEmail, HR_MAILBOX_ADDRESS } from "@/lib/email/send";
import { threadingForTicket } from "@/lib/email/threading";
import { writeAuditLog } from "@/lib/audit";

// §8, §12: runs daily at 06:00 Australia/Melbourne (Logic App recurrence,
// not built until Stage 7 -- this is the endpoint it will call). "Overdue
// tickets generate one escalation email per day, incrementing
// escalation_count, capped at 3 in total per ticket ... Unallocated
// overdue tickets escalate to the HR Lead directly."
export async function POST(request: Request) {
  const authError = checkJobKey(request);
  if (authError) return authError;

  const outcome = await runJob("sla-escalation", async (correlationId) => {
    const systemUserId = await getSystemUserId();
    const now = new Date();

    const candidates = await prisma.ticket.findMany({
      where: { isDeleted: false, status: { notIn: ["CLOSED", "ARCHIVED"] }, escalationCount: { lt: 3 } },
      include: { assignee: { select: { upn: true } } },
    });
    const overdue = candidates.filter((t) => isOverdue(t.slaDueAt, t.targetDueAt, t.status, now));

    const hrLeads = await prisma.user.findMany({ where: { role: "HR_LEAD", isActive: true }, select: { upn: true } });
    const hrLeadAddresses = hrLeads.map((u) => u.upn);

    let escalated = 0;
    let emailFailed = 0;
    let skippedNoRecipient = 0;

    for (const ticket of overdue) {
      const toRecipients = ticket.assignee ? [ticket.assignee.upn] : hrLeadAddresses;
      if (toRecipients.length === 0) {
        // No assignee and no active HR_LEAD user exists to escalate to --
        // shouldn't happen given §3's seed roster, but this must never
        // crash the whole job's loop over one ticket's edge case.
        skippedNoRecipient++;
        continue;
      }

      const elapsedHours = Math.floor((now.getTime() - ticket.receivedAt.getTime()) / (60 * 60 * 1000));
      const deadline = breachedDeadline(ticket.slaDueAt, ticket.targetDueAt);
      const effective = effectiveDueDate(ticket.slaDueAt, ticket.targetDueAt);
      const breachedByHours = Math.max(0, Math.floor((now.getTime() - effective.getTime()) / (60 * 60 * 1000)));
      const portalUrl = `${process.env.NEXTAUTH_URL ?? ""}/tickets/${ticket.id}`;

      const rendered = renderEscalationEmail({
        ticketNo: ticket.ticketNo,
        displaySubject: ticket.subject,
        priority: ticket.priority,
        elapsedHours,
        breachedDeadline: deadline,
        breachedByHours,
        portalUrl,
      });

      const sendResult = await sendTicketEmail({
        ticketId: ticket.id,
        messageType: "SLA_ESCALATION",
        toRecipients,
        ccRecipients: [HR_MAILBOX_ADDRESS],
        subject: rendered.subject,
        bodyText: rendered.bodyText,
        bodyHtml: rendered.bodyHtml,
        correlationId,
        sentById: systemUserId,
        threading: await threadingForTicket(ticket.id),
      });

      const newEscalationCount = ticket.escalationCount + 1;
      await prisma.ticket.update({
        where: { id: ticket.id },
        data: { escalationCount: newEscalationCount, lastEscalatedAt: now, version: { increment: 1 } },
      });

      await writeAuditLog({
        correlationId,
        actorId: systemUserId,
        action: "TICKET_ESCALATED",
        entity: "ticket",
        entityId: ticket.id,
        ticketId: ticket.id,
        afterJson: {
          escalationCount: newEscalationCount,
          breachedDeadline: deadline,
          breachedByHours,
          emailSent: sendResult.ok,
        },
      });

      escalated++;
      if (!sendResult.ok) emailFailed++;
    }

    return { processed: overdue.length, escalated, emailFailed, skippedNoRecipient };
  });

  return NextResponse.json(outcome);
}
