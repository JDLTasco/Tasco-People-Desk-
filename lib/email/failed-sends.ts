// §7.4: "surface as a banner on the ticket and an entry in the ADMIN
// failed-sends view." Since lib/email/send.ts exhausts all 3 attempts
// synchronously within a single call (no queue, no separate retry-later
// cron -- same "no long-running daemon, every cycle is a fresh
// connect/disconnect"-adjacent posture as the rest of this app), a message
// is in the failed state iff it has at least one delivery attempt and
// none of them succeeded. There is no mid-flight "still retrying" state
// to represent between requests.
import { prisma } from "../prisma";
import type { TicketEmailType } from "./send";

export interface FailedSendSummary {
  ticketMessageId: string;
  ticketId: string;
  ticketNo: string;
  displaySubject: string;
  messageType: TicketEmailType;
  toRecipients: string[];
  attempts: number;
  lastAttemptAt: Date;
  lastError: string | null;
}

export async function getFailedSends(): Promise<FailedSendSummary[]> {
  const messages = await prisma.ticketMessage.findMany({
    where: { direction: "OUTBOUND", messageType: { in: ["ALLOCATION", "OUTCOME", "SLA_ESCALATION"] } },
    include: {
      emailLog: { orderBy: { attemptedAt: "asc" } },
      ticket: { select: { id: true, ticketNo: true, subject: true } },
    },
    orderBy: { sentAt: "desc" },
  });

  return messages
    .filter((m) => m.emailLog.length > 0 && !m.emailLog.some((l) => l.status === "SENT"))
    .map((m) => {
      const last = m.emailLog[m.emailLog.length - 1];
      return {
        ticketMessageId: m.id,
        ticketId: m.ticket.id,
        ticketNo: m.ticket.ticketNo,
        displaySubject: m.ticket.subject,
        messageType: m.messageType as TicketEmailType,
        toRecipients: m.toRecipients,
        attempts: m.emailLog.length,
        lastAttemptAt: last.attemptedAt,
        lastError: last.error,
      };
    });
}
