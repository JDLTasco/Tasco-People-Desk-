// §7.4: "First entry into this [ALLOCATED] state sends the allocation
// email." Both real entry paths (self-claim, HR_LEAD/ADMIN assign-from-pool)
// need the identical send -- shared here rather than duplicated across
// app/api/tickets/[id]/claim and .../assign, the two call sites.
import type { Priority } from "../ingestion/priority";
import { renderAllocationEmail } from "./templates";
import { sendTicketEmail } from "./send";
import { threadingForTicket } from "./threading";

export interface AllocationEmailTicket {
  id: string;
  ticketNo: string;
  subject: string;
  requesterEmail: string;
  priority: Priority;
}

export async function sendAllocationEmail(
  ticket: AllocationEmailTicket,
  assigneeDisplayName: string,
  correlationId: string,
  sentById: string,
): Promise<void> {
  const rendered = renderAllocationEmail({
    ticketNo: ticket.ticketNo,
    displaySubject: ticket.subject,
    assigneeDisplayName,
    priority: ticket.priority,
  });

  await sendTicketEmail({
    ticketId: ticket.id,
    messageType: "ALLOCATION",
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
