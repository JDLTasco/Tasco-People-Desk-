import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiContext } from "@/lib/api-context";
import { forbidden } from "@/lib/http-errors";
import { canManageAdminSettings } from "@/lib/rbac";
import { archiveTicket } from "@/lib/archive/writer";

// §10: "a nightly job (plus on-demand for ADMIN)." Same underlying
// archiveTicket() the job route uses -- this is the immediate,
// session-authenticated trigger rather than waiting for the nightly
// schedule, not a different archiving path.
export async function POST(request: Request) {
  const ctx = await requireApiContext(request);
  if (ctx instanceof Response) return ctx;
  const { session } = ctx;

  if (!canManageAdminSettings(session.user.role)) {
    return forbidden("Only ADMIN may trigger an on-demand archive run");
  }

  const candidates = await prisma.ticket.findMany({ where: { status: "CLOSED" }, select: { id: true } });
  let archived = 0;
  let failed = 0;
  const failures: { ticketNo: string; error: string }[] = [];

  for (const { id } of candidates) {
    const result = await archiveTicket(id);
    if (result.ok) archived++;
    else {
      failed++;
      failures.push({ ticketNo: result.ticketNo, error: result.error ?? "unknown error" });
    }
  }

  return NextResponse.json({ processed: candidates.length, archived, failed, failures });
}
