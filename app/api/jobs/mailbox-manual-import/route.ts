import { NextResponse } from "next/server";
import { checkJobKey } from "@/lib/jobs/auth";
import { runJob } from "@/lib/jobs/run";
import { importMailboxSince, mailboxImportClient, MANUAL_IMPORT_JOB } from "@/lib/ingestion/mailbox-import";

// One-off operator-triggered import (run from Cloud Shell), deliberately
// separate from the real §7.2 delta poller (mailbox-delta-poll). The import
// itself, and why it reads a fixed mailbox with HR_MAILBOX_ID left unset,
// is in lib/ingestion/mailbox-import.ts (shared with the "Check mailbox"
// button since 2026-10-08).

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

  const client = mailboxImportClient();
  if (!client) {
    return NextResponse.json({ error: "AZURE_AD_TENANT_ID/CLIENT_ID/CLIENT_SECRET must be set for a manual import" }, { status: 500 });
  }

  // Fire-and-forget, same convention as the real webhook
  // (app/api/graph/notifications) -- a full mailbox import (real Graph
  // fetches + attachment blob writes per message) can easily exceed the
  // platform's ~230s front-end gateway timeout, confirmed 2026-09-23 when a
  // synchronous run got its response truncated mid-transfer. Poll job_runs
  // (job_name = 'mailbox-manual-import') for the real outcome rather than
  // trusting this response.
  void runJob(MANUAL_IMPORT_JOB, async (correlationId) => {
    const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000);
    return { ...(await importMailboxSince(client, since, correlationId)), sinceHours };
  });

  return NextResponse.json({ accepted: true, sinceHours, note: "Processing in the background -- poll job_runs (job_name='mailbox-manual-import') for the result." }, { status: 202 });
}
