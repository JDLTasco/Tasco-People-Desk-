import { NextResponse } from "next/server";
import { requireApiContext } from "@/lib/api-context";
import { badRequest } from "@/lib/http-errors";
import {
  getAllOpenTickets,
  getClosedTickets,
  getMyTickets,
  getOverdueTickets,
  getPoolTickets,
} from "@/lib/tickets/queries";
import { createTicket } from "@/lib/tickets/create-ticket";
import { writeAuditLog } from "@/lib/audit";
import type { Priority } from "@/lib/ingestion/priority";

// §13's list views. "view" defaults to pool, the spec's own default landing view.
export async function GET(request: Request) {
  const ctx = await requireApiContext(request);
  if (ctx instanceof Response) return ctx;
  const { session } = ctx;

  const view = new URL(request.url).searchParams.get("view") ?? "pool";

  switch (view) {
    case "pool":
      return NextResponse.json({ tickets: await getPoolTickets(session.user.id, session.user.role) });
    case "mine":
      return NextResponse.json({ tickets: await getMyTickets(session.user.id) });
    case "open":
      return NextResponse.json({ tickets: await getAllOpenTickets(session.user.id, session.user.role) });
    case "overdue":
      return NextResponse.json({ tickets: await getOverdueTickets(session.user.id, session.user.role) });
    case "closed":
      return NextResponse.json({ tickets: await getClosedTickets(session.user.id, session.user.role) });
    default:
      return badRequest(`Unknown view: ${view} (expected pool, mine, open, overdue, or closed)`);
  }
}

interface CreateTicketBody {
  requesterName?: string;
  requesterEmail?: string;
  subject?: string;
  description?: string;
  priority?: Priority;
}

const VALID_PRIORITIES: Priority[] = ["P1", "P2", "P3"];

// Operator addition (2026-09-16, not in the original v1.3 text -- see
// STATUS.md): a staff member manually logging a request that didn't
// arrive by email (a phone call, a walk-in, anything that needs to go
// through the same lifecycle as a real ticket). Open to any signed-in
// staff member, same as self-claiming from the Pool -- no ADMIN/HR_LEAD
// gate. Lands in NEW, unassigned, in the Pool exactly like an ingested
// ticket, so every downstream rule (claim, category-before-IN_ACTION,
// allocation email, etc.) applies identically without special-casing.
export async function POST(request: Request) {
  const ctx = await requireApiContext(request);
  if (ctx instanceof Response) return ctx;
  const { session, correlationId } = ctx;

  const body = (await request.json().catch(() => null)) as CreateTicketBody | null;
  const requesterName = body?.requesterName?.trim();
  const requesterEmail = body?.requesterEmail?.trim();
  const subject = body?.subject?.trim();
  const description = body?.description?.trim();
  const priority = body?.priority;

  if (!requesterName) return badRequest("requesterName is required");
  if (!requesterEmail) return badRequest("requesterEmail is required");
  if (!subject) return badRequest("subject is required");
  if (!description) return badRequest("description is required");
  if (!priority || !VALID_PRIORITIES.includes(priority)) {
    return badRequest("priority is required and must be P1, P2, or P3");
  }

  const receivedAt = new Date();
  const created = await createTicket({
    receivedAt,
    subject,
    requesterEmail,
    requesterName,
    priority,
    firstMessage: {
      direction: "INBOUND",
      messageType: "MANUAL",
      internetMessageId: `<manual-${crypto.randomUUID()}@internal>`,
      conversationId: `manual-${crypto.randomUUID()}`,
      fromAddress: requesterEmail,
      fromName: requesterName,
      bodyText: description,
      correlationId,
    },
  });

  await writeAuditLog({
    correlationId,
    actorId: session.user.id,
    action: "TICKET_CREATED",
    entity: "ticket",
    entityId: created.ticketId,
    ticketId: created.ticketId,
    afterJson: { ticketNo: created.ticketNo, priority, requesterEmail, source: "manual" },
  });

  return NextResponse.json({ ticketId: created.ticketId, ticketNo: created.ticketNo }, { status: 201 });
}
