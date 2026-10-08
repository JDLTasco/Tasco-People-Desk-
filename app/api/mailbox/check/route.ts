import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { unauthorized } from "@/lib/http-errors";
import { runJob } from "@/lib/jobs/run";
import { writeAuditLog } from "@/lib/audit";
import { importMailboxSince, mailboxImportClient, MANUAL_IMPORT_JOB, type MailboxImportResult } from "@/lib/ingestion/mailbox-import";

// "Check mailbox" button in the nav bar (John, 2026-10-08): any signed-in
// staff member can run the same read-only import as the Cloud Shell job
// straight away. It looks back to just before the last successful import
// (an hour's overlap; already-imported emails are skipped as duplicates),
// 24 hours if there has never been one, and never more than 14 days.
const OVERLAP_MS = 60 * 60 * 1000;
const FIRST_RUN_MS = 24 * 60 * 60 * 1000;
const MAX_LOOKBACK_MS = 14 * 24 * 60 * 60 * 1000;
// A run still RUNNING after this long is treated as stuck, not in progress.
const RUNNING_STALE_MS = 20 * 60 * 1000;
const AUDIT_ACTION = "MAILBOX_CHECKED";

async function latestRun() {
  return prisma.jobRun.findFirst({ where: { jobName: MANUAL_IMPORT_JOB }, orderBy: { startedAt: "desc" } });
}

/** Starts an import in the background; poll GET for the outcome. */
export async function POST() {
  const session = await getSession();
  if (!session?.user) return unauthorized();
  const userId = session.user.id;

  const now = Date.now();
  const last = await latestRun();
  if (last?.status === "RUNNING" && now - last.startedAt.getTime() < RUNNING_STALE_MS) {
    return NextResponse.json({ error: "A mailbox check is already running.", startedAt: last.startedAt }, { status: 409 });
  }

  const client = mailboxImportClient();
  if (!client) {
    return NextResponse.json({ error: "The mailbox connection isn't set up on this server." }, { status: 503 });
  }
  const lastSuccess = await prisma.jobRun.findFirst({
    where: { jobName: MANUAL_IMPORT_JOB, status: "SUCCEEDED" },
    orderBy: { startedAt: "desc" },
  });
  const sinceMs = lastSuccess ? lastSuccess.startedAt.getTime() - OVERLAP_MS : now - FIRST_RUN_MS;
  const since = new Date(Math.max(sinceMs, now - MAX_LOOKBACK_MS));

  // Fire-and-forget, as the job route: an import can outlast the platform's
  // ~230s gateway timeout. The summary is kept as an audit row so GET can
  // report how many tickets were created.
  void runJob(MANUAL_IMPORT_JOB, async (correlationId) => {
    const result = await importMailboxSince(client, since, correlationId);
    await writeAuditLog({
      correlationId,
      actorId: userId,
      action: AUDIT_ACTION,
      entity: "mailbox",
      entityId: result.mailbox,
      afterJson: result,
    });
    return result;
  }).catch(() => {
    // already recorded as FAILED on the job_runs row
  });

  return NextResponse.json({ accepted: true, since: since.toISOString() }, { status: 202 });
}

/** The most recent mailbox import (button or Cloud Shell) and, for a button run, its summary. */
export async function GET() {
  const session = await getSession();
  if (!session?.user) return unauthorized();
  const run = await latestRun();
  if (!run) return NextResponse.json({ run: null });
  const audit = await prisma.auditLog.findFirst({
    where: { correlationId: run.correlationId, action: AUDIT_ACTION },
    select: { afterJson: true },
  });
  const result = (audit?.afterJson ?? null) as MailboxImportResult | null;
  return NextResponse.json({
    run: {
      status: run.status,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      processed: run.itemsProcessed,
      created: result?.created ?? null,
      threaded: result?.threaded ?? null,
      createdTicketNos: result?.createdTicketNos ?? [],
      error: run.status === "FAILED" ? "The mailbox check failed. Try again; if it keeps failing, tell your administrator." : null,
    },
  });
}
