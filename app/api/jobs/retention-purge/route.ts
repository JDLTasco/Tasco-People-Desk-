import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkJobKey } from "@/lib/jobs/auth";
import { runJob } from "@/lib/jobs/run";
import { getSystemUserId } from "@/lib/ingestion/process-message";
import { writeAuditLog } from "@/lib/audit";
import { blobStore } from "@/lib/blob-store";
import { archiveDir } from "@/lib/archive/writer";

// §10 "Retention": daily 02:00 (Logic App recurrence, Stage 7). Hard-
// deletes database rows and blob artefacts where retention_purge_date is
// past AND is_legal_hold is false -- "Soft-deleted tickets are still
// purged on the same schedule unless under legal hold. Soft delete is
// not a retention override; legal hold is," so is_deleted is
// deliberately not part of the WHERE clause at all.
export async function POST(request: Request) {
  const authError = checkJobKey(request);
  if (authError) return authError;

  const outcome = await runJob("retention-purge", async (correlationId) => {
    const systemUserId = await getSystemUserId();
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const candidates = await prisma.ticket.findMany({
      where: { retentionPurgeDate: { lt: today }, isLegalHold: false },
      include: { category: { select: { name: true } } },
    });

    let purged = 0;
    let failed = 0;

    for (const ticket of candidates) {
      try {
        // §10: "writing one purge record per ticket to audit_log (ticket
        // number, subject hash, category, purge timestamp, correlation
        // ID) so destruction is provable." Written before the delete;
        // the FK's onDelete: SetNull (see AuditLog.ticket's own schema
        // comment) means this very row's ticketId is nulled out the
        // instant the ticket row goes, while entityId (a plain string)
        // still proves which ticket it was.
        await writeAuditLog({
          correlationId,
          actorId: systemUserId,
          action: "TICKET_RETENTION_PURGED",
          entity: "ticket",
          entityId: ticket.id,
          ticketId: ticket.id,
          afterJson: {
            ticketNo: ticket.ticketNo,
            subjectHash: createHash("sha256").update(ticket.subject).digest("hex"),
            category: ticket.category?.name ?? null,
            purgedAt: new Date().toISOString(),
          },
        });

        await blobStore.deletePrefix(archiveDir(ticket));
        await prisma.ticket.delete({ where: { id: ticket.id } });
        purged++;
      } catch (err) {
        failed++;
        console.error(`Retention purge failed for ${ticket.ticketNo} (${ticket.id}):`, err instanceof Error ? err.message : err);
      }
    }

    return { processed: candidates.length, purged, failed };
  });

  return NextResponse.json(outcome);
}
