import { NextResponse } from "next/server";
import { checkJobKey } from "@/lib/jobs/auth";
import { runJob } from "@/lib/jobs/run";
import { GraphApiClient } from "@/lib/graph/client";
import { processInboundMessage } from "@/lib/ingestion/process-message";

// One-off operator-triggered import, deliberately separate from the real
// §7.2 delta poller (mailbox-delta-poll). Constructs its own GraphApiClient
// directly with a hardcoded mailbox rather than going through
// getGraphClient()/isGraphConfigured() -- HR_MAILBOX_ID stays unset on
// purpose so every email-sending route (claim/assign/outcome/close,
// sla-escalation) keeps failing closed via the existing "Graph is not
// configured" path. This endpoint only ever reads; it never has the
// ability to send. See STATUS.md's 2026-09-23 mailbox smoke-test entry.
const SMOKE_TEST_MAILBOX = "hrtickets@tascopetroleum.com.au";

export async function POST(request: Request) {
  const authError = checkJobKey(request);
  if (authError) return authError;

  let sinceHours = 24;
  try {
    const body = (await request.json()) as { sinceHours?: number };
    if (typeof body.sinceHours === "number" && body.sinceHours > 0) {
      sinceHours = body.sinceHours;
    }
  } catch {
    // No body / not JSON -- default to 24h.
  }

  const outcome = await runJob("mailbox-manual-import", async (correlationId) => {
    const tenantId = process.env.AZURE_AD_TENANT_ID;
    const clientId = process.env.AZURE_AD_CLIENT_ID;
    const clientSecret = process.env.AZURE_AD_CLIENT_SECRET;
    if (!tenantId || !clientId || !clientSecret) {
      throw new Error("AZURE_AD_TENANT_ID/CLIENT_ID/CLIENT_SECRET must be set for a manual import");
    }

    const client = new GraphApiClient(tenantId, clientId, clientSecret, SMOKE_TEST_MAILBOX);
    const sinceIso = new Date(Date.now() - sinceHours * 60 * 60 * 1000).toISOString();
    const messages = await client.listInboxSince(sinceIso);

    let created = 0;
    let threaded = 0;
    let suppressed = 0;
    let ignored = 0;
    let duplicate = 0;
    const createdTicketNos: string[] = [];

    for (const message of messages) {
      const result = await processInboundMessage(message, correlationId);
      switch (result.action) {
        case "CREATED":
          created++;
          createdTicketNos.push(result.ticketNo);
          break;
        case "THREADED":
          threaded++;
          break;
        case "SUPPRESSED":
          suppressed++;
          break;
        case "AUTO_REPLY_IGNORED":
          ignored++;
          break;
        case "DUPLICATE":
          duplicate++;
          break;
      }
    }

    return { mailbox: SMOKE_TEST_MAILBOX, sinceHours, processed: messages.length, created, threaded, suppressed, ignored, duplicate, createdTicketNos };
  });

  return NextResponse.json(outcome);
}
