import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { melbourneDateOnly } from "../timezone";
import { ticketNoWithSequence } from "../ingestion/ticket-number";
import { SLA_HOURS } from "./sla";
import type { Priority } from "../ingestion/priority";

const MAX_SEQUENCE = 99; // varchar(12) = 10-digit base + 2-digit sequence

export function isTicketNoCollision(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === "P2002" &&
    Array.isArray((err.meta as { target?: unknown })?.target) &&
    ((err.meta as { target: string[] }).target).some((t) => t.includes("ticket_no"))
  );
}

export interface CreateTicketInput {
  receivedAt: Date;
  subject: string;
  requesterEmail: string;
  requesterName: string;
  priority: Priority;
  ccRecipients?: string[];
  firstMessage: {
    direction: "INBOUND" | "OUTBOUND";
    messageType: "ORIGINAL" | "MANUAL";
    graphMessageId?: string;
    internetMessageId?: string;
    conversationId?: string;
    fromAddress: string;
    fromName?: string;
    toRecipients?: string[];
    ccRecipients?: string[];
    bodyText?: string;
    bodyHtml?: string;
    correlationId: string;
  };
}

export interface CreatedTicket {
  ticketId: string;
  ticketNo: string;
  firstMessageId: string;
}

/**
 * §5/§7.3's ticket_no assignment (YYMMDDHHMM + 2-digit same-minute
 * collision retry) plus the rest of a new ticket's derived fields
 * (request_date, sla_due_at, retention_purge_date). The one place a new
 * ticket row gets created -- originally only real email ingestion
 * (lib/ingestion/process-message.ts), extracted here so a staff member
 * manually logging a request that didn't arrive by email (operator
 * addition, 2026-09-16, not in the original v1.3 text -- see STATUS.md)
 * gets the exact same numbering/SLA rules instead of a second, drifting
 * copy. Callers are responsible for their own TICKET_CREATED audit log
 * write (the right actor differs: the seeded system user for ingestion,
 * a real signed-in user for a manual entry) and for attachments, which
 * this doesn't handle.
 */
export async function createTicket(input: CreateTicketInput): Promise<CreatedTicket> {
  const requestDate = melbourneDateOnly(input.receivedAt);
  const slaDueAt = new Date(input.receivedAt.getTime() + SLA_HOURS[input.priority] * 60 * 60 * 1000);
  const retentionPurgeDate = new Date(requestDate);
  retentionPurgeDate.setUTCFullYear(retentionPurgeDate.getUTCFullYear() + 7);
  const subject = input.subject || "(no subject)";
  const fm = input.firstMessage;

  for (let sequence = 1; sequence <= MAX_SEQUENCE; sequence++) {
    const ticketNo = ticketNoWithSequence(input.receivedAt, sequence);
    try {
      const ticket = await prisma.ticket.create({
        data: {
          ticketNo,
          originalSubject: subject,
          subject,
          requesterEmail: input.requesterEmail,
          requesterName: input.requesterName,
          ccRecipients: input.ccRecipients ?? [],
          receivedAt: input.receivedAt,
          requestDate,
          priority: input.priority,
          slaDueAt,
          status: "NEW",
          retentionPurgeDate,
          messages: {
            create: {
              direction: fm.direction,
              messageType: fm.messageType,
              graphMessageId: fm.graphMessageId,
              internetMessageId: fm.internetMessageId,
              conversationId: fm.conversationId,
              fromAddress: fm.fromAddress,
              fromName: fm.fromName,
              toRecipients: fm.toRecipients ?? [],
              ccRecipients: fm.ccRecipients ?? [],
              subject,
              bodyHtml: fm.bodyHtml,
              bodyText: fm.bodyText,
              receivedAt: fm.direction === "INBOUND" ? input.receivedAt : undefined,
              sentAt: fm.direction === "OUTBOUND" ? input.receivedAt : undefined,
              correlationId: fm.correlationId,
            },
          },
        },
        include: { messages: true },
      });
      return { ticketId: ticket.id, ticketNo, firstMessageId: ticket.messages[0].id };
    } catch (err) {
      if (isTicketNoCollision(err)) continue;
      throw err;
    }
  }

  throw new Error(`Exhausted ${MAX_SEQUENCE} ticket_no sequence values for the same minute -- should never happen in practice`);
}
