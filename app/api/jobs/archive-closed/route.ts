import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkJobKey } from "@/lib/jobs/auth";
import { runJob } from "@/lib/jobs/run";
import { archiveTicket } from "@/lib/archive/writer";

// §10, §12: "On transition to CLOSED, a nightly job (plus on-demand for
// ADMIN) writes the archive artefacts and sets status ARCHIVED." Runs
// daily 01:00 (Logic App recurrence, not built until Stage 7). Every
// CLOSED ticket is a candidate regardless of is_deleted -- soft-delete
// doesn't pause archiving or retention (§10 "Retention": "Soft-deleted
// tickets are still purged on the same schedule").
export async function POST(request: Request) {
  const authError = checkJobKey(request);
  if (authError) return authError;

  const outcome = await runJob("archive-closed", async () => {
    const candidates = await prisma.ticket.findMany({ where: { status: "CLOSED" }, select: { id: true } });

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

    return { processed: candidates.length, archived, failed, failures };
  });

  return NextResponse.json(outcome);
}
