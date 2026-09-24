import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkJobKey } from "@/lib/jobs/auth";
import { runJob } from "@/lib/jobs/run";
import { getBlobServiceClient, splitBlobPath } from "@/lib/azure/blob-client";
import { mapDefenderVerdict, applyScanVerdict } from "@/lib/scan/verdict";

const TIMEOUT_MINUTES = 60;
const SCAN_RESULT_TAG_KEY = "Malware Scanning scan result";

// §7.3.2 reconciliation path: every 15 minutes, for anything still PENDING,
// read the blob's own index tag directly rather than wait on Event Grid --
// "the same reason Graph ingestion has a webhook and a delta poller" (§7.2,
// ADR-0015). Anything PENDING past 60 minutes is blocked outright,
// SCAN_TIMEOUT, fail-closed (§7.3.2: "never default to CLEAN").
export async function POST(request: Request) {
  const authError = checkJobKey(request);
  if (authError) return authError;

  const outcome = await runJob("attachment-scan-reconcile", async (correlationId) => {
    // Also re-checks timed-out attachments: a real Defender verdict that
    // arrives after the 60-minute timeout still counts (see
    // canApplyVerdict() in lib/scan/verdict.ts).
    const pending = await prisma.ticketAttachment.findMany({
      where: { OR: [{ scanStatus: "PENDING" }, { scanStatus: "BLOCKED", blockReason: "SCAN_TIMEOUT" }] },
    });

    let resolved = 0;
    let timedOut = 0;
    let stillPending = 0;
    let failed = 0;

    for (const attachment of pending) {
      const ageMinutes = (Date.now() - attachment.createdAt.getTime()) / 60_000;
      try {
        if (attachment.scanStatus === "PENDING" && ageMinutes > TIMEOUT_MINUTES) {
          const result = await applyScanVerdict(attachment.blobPath, "SCAN_TIMEOUT", correlationId);
          if (result.applied) {
            timedOut++;
            console.error("Attachment scan timeout -- alerting", {
              correlationId,
              attachmentId: attachment.id,
              blobPath: attachment.blobPath,
            });
          }
          continue;
        }

        const { container, blobName } = splitBlobPath(attachment.blobPath);
        const blobClient = getBlobServiceClient().getContainerClient(container).getBlockBlobClient(blobName);
        const { tags } = await blobClient.getTags();
        const rawResult = tags[SCAN_RESULT_TAG_KEY];
        if (!rawResult) {
          stillPending++;
          continue;
        }

        const verdict = mapDefenderVerdict(rawResult);
        if (!verdict) {
          stillPending++;
          continue;
        }

        const result = await applyScanVerdict(attachment.blobPath, verdict, correlationId);
        if (result.applied) resolved++;
      } catch (err) {
        failed++;
        console.error(`Attachment scan reconcile failed for ${attachment.id}:`, err instanceof Error ? err.message : err);
      }
    }

    return { processed: pending.length, resolved, timedOut, stillPending, failed };
  });

  return NextResponse.json(outcome);
}
