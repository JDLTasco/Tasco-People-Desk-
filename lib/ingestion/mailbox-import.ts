import { GraphApiClient } from "../graph/client";
import { processInboundMessage } from "./process-message";

// The read-only mailbox import, shared by the operator job
// (POST /api/jobs/mailbox-manual-import, run from Cloud Shell) and the
// "Check mailbox" button (POST /api/mailbox/check, John 2026-10-08).
// Builds its own GraphApiClient with a fixed mailbox rather than going
// through getGraphClient()/isGraphConfigured() -- HR_MAILBOX_ID stays unset
// on purpose so every email-sending route keeps failing closed via the
// existing "Graph is not configured" path. This only ever reads; it never
// has the ability to send. See STATUS.md's 2026-09-23 mailbox smoke-test entry.
export const IMPORT_MAILBOX = "hrtickets@tascopetroleum.com.au";
export const MANUAL_IMPORT_JOB = "mailbox-manual-import";

export interface MailboxImportResult {
  mailbox: string;
  since: string;
  processed: number;
  created: number;
  threaded: number;
  suppressed: number;
  ignored: number;
  duplicate: number;
  createdTicketNos: string[];
}

/** Null when the app registration settings needed to read the mailbox are missing. */
export function mailboxImportClient(): GraphApiClient | null {
  const tenantId = process.env.AZURE_AD_TENANT_ID;
  const clientId = process.env.AZURE_AD_CLIENT_ID;
  const clientSecret = process.env.AZURE_AD_CLIENT_SECRET;
  if (!tenantId || !clientId || !clientSecret) return null;
  return new GraphApiClient(tenantId, clientId, clientSecret, IMPORT_MAILBOX);
}

/** Imports every inbox message received since `since`. Already-imported messages count as duplicates. */
export async function importMailboxSince(client: GraphApiClient, since: Date, correlationId: string): Promise<MailboxImportResult> {
  const messages = await client.listInboxSince(since.toISOString());
  const result: MailboxImportResult = {
    mailbox: IMPORT_MAILBOX,
    since: since.toISOString(),
    processed: messages.length,
    created: 0,
    threaded: 0,
    suppressed: 0,
    ignored: 0,
    duplicate: 0,
    createdTicketNos: [],
  };
  for (const message of messages) {
    const r = await processInboundMessage(message, correlationId);
    switch (r.action) {
      case "CREATED":
        result.created++;
        result.createdTicketNos.push(r.ticketNo);
        break;
      case "THREADED":
        result.threaded++;
        break;
      case "SUPPRESSED":
        result.suppressed++;
        break;
      case "AUTO_REPLY_IGNORED":
        result.ignored++;
        break;
      case "DUPLICATE":
        result.duplicate++;
        break;
    }
  }
  return result;
}
