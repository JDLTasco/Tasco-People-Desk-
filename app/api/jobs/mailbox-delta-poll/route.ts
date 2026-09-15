import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkJobKey } from "@/lib/jobs/auth";
import { runJob } from "@/lib/jobs/run";
import { getGraphClient } from "@/lib/graph/client";
import { processInboundMessage } from "@/lib/ingestion/process-message";

// §7.2, §12: runs every 15 minutes (Logic App recurrence, not built until
// Stage 7 -- this is the endpoint it will call). "Webhooks drop. This is
// not optional." Comparing internet_message_id against ticket_messages is
// processInboundMessage's own idempotency check, not duplicated here.
export async function POST(request: Request) {
  const authError = checkJobKey(request);
  if (authError) return authError;

  const outcome = await runJob("mailbox-delta-poll", async (correlationId) => {
    // Throws until §14 items 1-3 exist -- see getGraphClient()'s own doc
    // comment. That failure still gets recorded via job_runs (FAILED,
    // with the reason), which is honest: no ticket ingestion is
    // happening yet, which is exactly what §12.1's liveness alert should
    // eventually catch either way.
    const client = getGraphClient();

    const state = await prisma.graphDeltaState.findFirst();
    const { messages, deltaLink } = await client.listInboxDelta(state?.deltaLink);

    let created = 0;
    let threaded = 0;
    let suppressed = 0;
    let ignored = 0;
    let duplicate = 0;

    for (const message of messages) {
      const result = await processInboundMessage(message, correlationId);
      switch (result.action) {
        case "CREATED":
          created++;
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

    if (state) {
      await prisma.graphDeltaState.update({ where: { id: state.id }, data: { deltaLink } });
    } else {
      await prisma.graphDeltaState.create({ data: { deltaLink } });
    }

    return { processed: messages.length, created, threaded, suppressed, ignored, duplicate };
  });

  return NextResponse.json(outcome);
}
