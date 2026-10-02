// Operator amendment (John, 2026-10-03): the requester's acknowledgement
// ("received, here is your ticket number") goes out when the ticket is
// created -- by email ingestion or a manual + New ticket -- instead of
// §7.4's allocation email when an officer claims it. Claim/assign no
// longer email the requester.
import { renderAcknowledgementEmail } from "./templates";
import { HR_MAILBOX_ADDRESS, sendTicketEmail } from "./send";
import { threadingForTicket } from "./threading";

/**
 * Only mail that arrived recently is acknowledged. The mailbox poller's
 * first real run pulls the shared mailbox's whole history (Graph delta with
 * no saved state), and catch-up imports re-read the last day or so -- an
 * acknowledgement for a weeks-old email would confuse people.
 */
export const ACKNOWLEDGEMENT_MAX_AGE_HOURS = 24;

export function shouldSendAcknowledgement(
  input: { receivedAt: Date; requesterEmail: string },
  now: Date = new Date(),
  hrMailboxAddress: string = HR_MAILBOX_ADDRESS,
): boolean {
  if (!input.requesterEmail.includes("@")) return false;
  // Never acknowledge our own mailbox (e.g. a copy of an outbound email).
  if (input.requesterEmail.trim().toLowerCase() === hrMailboxAddress.toLowerCase()) return false;
  return now.getTime() - input.receivedAt.getTime() <= ACKNOWLEDGEMENT_MAX_AGE_HOURS * 60 * 60 * 1000;
}

export interface AcknowledgementTicket {
  id: string;
  ticketNo: string;
  subject: string;
  requesterEmail: string;
}

export async function sendAcknowledgementEmail(
  ticket: AcknowledgementTicket,
  correlationId: string,
  sentById: string,
): Promise<{ ok: boolean }> {
  const rendered = renderAcknowledgementEmail({ ticketNo: ticket.ticketNo, displaySubject: ticket.subject });
  return sendTicketEmail({
    ticketId: ticket.id,
    messageType: "ACKNOWLEDGEMENT",
    toRecipients: [ticket.requesterEmail],
    ccRecipients: [],
    subject: rendered.subject,
    bodyText: rendered.bodyText,
    bodyHtml: rendered.bodyHtml,
    correlationId,
    sentById,
    threading: await threadingForTicket(ticket.id),
  });
}
