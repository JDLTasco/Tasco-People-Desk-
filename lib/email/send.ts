// §7.4: the single place every outbound ticket email (allocation, outcome,
// SLA escalation) goes through -- writes the ticket_messages row first (the
// correspondence record exists regardless of delivery outcome), then
// attempts Graph sendMail with retry+backoff, logging one email_log row
// per attempt. "Failed sends retry three times with backoff, then surface
// as a banner on the ticket and an entry in the ADMIN failed-sends view" --
// this never throws for a delivery failure; that's a recorded outcome, not
// an exception callers have to special-case.
import { prisma } from "../prisma";
import { getGraphClient, type GraphClient } from "../graph/client";

export type TicketEmailType = "ALLOCATION" | "OUTCOME" | "SLA_ESCALATION" | "CLOSED_RESOLVED";

export interface ThreadingContext {
  inReplyToInternetMessageId?: string;
  referencesInternetMessageIds?: string[];
}

export interface SendTicketEmailParams {
  ticketId: string;
  messageType: TicketEmailType;
  toRecipients: string[];
  ccRecipients: string[];
  subject: string;
  bodyText: string;
  bodyHtml: string;
  correlationId: string;
  /** The human officer who triggered this send, or the seeded system actor for the automated escalation job. */
  sentById: string;
  threading?: ThreadingContext;
}

export interface SendTicketEmailResult {
  ok: boolean;
  ticketMessageId: string;
  attempts: number;
}

const MAX_ATTEMPTS = 3;
// Deliberately short (not minutes-scale backoff): every send site in this
// app is awaited synchronously within the triggering HTTP request (claim,
// assign, the outcome dispatch confirm) -- there is no background job
// queue in this build (§17 lists no such feature; nothing here assumes
// one). A real Graph outage still adds a few seconds of latency to those
// actions; documented in STATUS.md as a known tradeoff of this
// architecture, not silently accepted.
const BACKOFF_MS = [1000, 3000];

// §7.0: the real shared mailbox's address once §14 item 0 exists. Falls
// back to this literal (not invented -- the exact address §7.0 names) only
// when HR_MAILBOX_ID isn't configured yet, matching every other §14-gated
// path's "inert but honest" convention rather than storing an empty string.
export const HR_MAILBOX_ADDRESS = process.env.HR_MAILBOX_ID || "hrtickets@tascopetroleum.com.au";

async function defaultSleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendTicketEmail(
  params: SendTicketEmailParams,
  deps: { client?: GraphClient; sleep?: (ms: number) => Promise<void> } = {},
): Promise<SendTicketEmailResult> {
  const sleep = deps.sleep ?? defaultSleep;

  const message = await prisma.ticketMessage.create({
    data: {
      ticketId: params.ticketId,
      direction: "OUTBOUND",
      messageType: params.messageType,
      toRecipients: params.toRecipients,
      ccRecipients: params.ccRecipients,
      fromAddress: HR_MAILBOX_ADDRESS,
      subject: params.subject,
      bodyText: params.bodyText,
      bodyHtml: params.bodyHtml,
      sentById: params.sentById,
      sentAt: new Date(),
      correlationId: params.correlationId,
    },
  });

  let ok = false;
  let attempts = 0;
  for (let attempt = 0; attempt < MAX_ATTEMPTS && !ok; attempt++) {
    attempts = attempt + 1;
    try {
      const client = deps.client ?? getGraphClient();
      await client.sendMail({
        toRecipients: params.toRecipients,
        ccRecipients: params.ccRecipients,
        subject: params.subject,
        bodyHtml: params.bodyHtml,
        inReplyToInternetMessageId: params.threading?.inReplyToInternetMessageId,
        referencesInternetMessageIds: params.threading?.referencesInternetMessageIds,
      });
      ok = true;
      await prisma.emailLog.create({
        data: {
          ticketId: params.ticketId,
          messageId: message.id,
          attemptNo: attempts,
          status: "SENT",
          correlationId: params.correlationId,
        },
      });
    } catch (err) {
      await prisma.emailLog.create({
        data: {
          ticketId: params.ticketId,
          messageId: message.id,
          attemptNo: attempts,
          status: "FAILED",
          error: err instanceof Error ? err.message : String(err),
          correlationId: params.correlationId,
        },
      });
      if (attempt < MAX_ATTEMPTS - 1) {
        await sleep(BACKOFF_MS[attempt] ?? BACKOFF_MS[BACKOFF_MS.length - 1]);
      }
    }
  }

  return { ok, ticketMessageId: message.id, attempts };
}
