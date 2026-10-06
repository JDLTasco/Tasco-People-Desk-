import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkJobKey } from "@/lib/jobs/auth";
import { runJob } from "@/lib/jobs/run";
import { archiveTicket } from "@/lib/archive/writer";
import { replyWindowEnd, REPLY_WINDOW_WORKING_DAYS } from "@/lib/tickets/reopen";
import { IMMEDIATE_ARCHIVE_CLOSE_REASONS } from "@/lib/tickets/archive-on-close";
import { loadHolidaySet } from "@/lib/calendar/holidays";
import { writeStatusHistory } from "@/lib/tickets/history";
import { writeAuditLog } from "@/lib/audit";
import { getSystemUserId } from "@/lib/ingestion/process-message";

// §10, §12: "On transition to CLOSED, a nightly job (plus on-demand for
// ADMIN) writes the archive artefacts and sets status ARCHIVED." Runs
// daily 01:00 (Logic App recurrence, infra/modules/jobs.bicep). Every
// CLOSED ticket is a candidate regardless of is_deleted -- soft-delete
// doesn't pause archiving or retention (§10 "Retention": "Soft-deleted
// tickets are still purged on the same schedule").
//
// Reply windows (operator amendment, John, 2026-10-06 -- replaces the 30-day
// reopen window of 2026-09-29; see lib/tickets/reopen.ts):
//   1. OUTCOME tickets whose outcome went out more than 2 working days ago
//      with no reply are closed (RESOLVED). closed_at is set to the moment the
//      window ended, not to when this job happened to run, so the CLOSED
//      window that follows is a true 2 working days.
//   2. CLOSED tickets more than 2 working days past closed_at are archived.
// Info only / Autoclose closes archive immediately (2026-10-03); any whose
// immediate archive write failed are retried here regardless of age. A
// CLOSED ticket with no closed_at (shouldn't exist) is archived rather than
// held forever. Admin -> Archive still archives on demand.
export async function POST(request: Request) {
  const authError = checkJobKey(request);
  if (authError) return authError;

  const outcome = await runJob("archive-closed", async () => {
    const now = new Date();
    const holidays = await loadHolidaySet();
    const systemId = await getSystemUserId();

    // 1. OUTCOME -> CLOSED once the outcome's reply window has ended.
    const outcomes = await prisma.ticket.findMany({
      where: { status: "OUTCOME", outcomeSentAt: { not: null } },
      select: { id: true, outcomeSentAt: true },
    });
    let autoClosed = 0;
    for (const t of outcomes) {
      const windowEnd = replyWindowEnd(t.outcomeSentAt!, holidays);
      if (now < windowEnd) continue;
      // Conditional on still being OUTCOME, so a reply that reopened it a
      // moment ago wins.
      const result = await prisma.ticket.updateMany({
        where: { id: t.id, status: "OUTCOME" },
        data: { status: "CLOSED", closeReason: "RESOLVED", closedAt: windowEnd, version: { increment: 1 } },
      });
      if (result.count === 0) continue;
      autoClosed++;
      const reason = `No reply within ${REPLY_WINDOW_WORKING_DAYS} working days of the outcome -- closed automatically`;
      const correlationId = crypto.randomUUID();
      await writeStatusHistory({ ticketId: t.id, fromStatus: "OUTCOME", toStatus: "CLOSED", actorId: systemId, reason, correlationId });
      await writeAuditLog({
        correlationId,
        actorId: systemId,
        action: "TICKET_CLOSED",
        entity: "ticket",
        entityId: t.id,
        ticketId: t.id,
        beforeJson: { status: "OUTCOME" },
        afterJson: { status: "CLOSED", closeReason: "RESOLVED", closedAt: windowEnd.toISOString(), trigger: "REPLY_WINDOW" },
        reason,
      });
    }

    // 2. CLOSED -> ARCHIVED once the close's reply window has ended.
    const closed = await prisma.ticket.findMany({
      where: { status: "CLOSED" },
      select: { id: true, closedAt: true, closeReason: true },
    });
    const immediate: readonly string[] = IMMEDIATE_ARCHIVE_CLOSE_REASONS;
    const candidates = closed.filter(
      (t) =>
        !t.closedAt ||
        (t.closeReason !== null && immediate.includes(t.closeReason)) ||
        now >= replyWindowEnd(t.closedAt, holidays),
    );

    let archived = 0;
    let failed = 0;
    const failures: { ticketNo: string; error: string }[] = [];

    for (const { id } of candidates) {
      const result = await archiveTicket(id);
      if (result.ok) {
        archived++;
      } else {
        failed++;
        failures.push({ ticketNo: result.ticketNo, error: result.error ?? "unknown error" });
      }
    }

    return { autoClosed, processed: candidates.length, archived, failed, failures };
  });

  return NextResponse.json(outcome);
}
