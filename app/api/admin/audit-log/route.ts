import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiContext } from "@/lib/api-context";
import { forbidden } from "@/lib/http-errors";
import { canViewAuditLog } from "@/lib/rbac";
import type { Prisma } from "@prisma/client";

// §11 "Audit search": by ticket, actor, action, date range, and
// correlation ID. §3's permission matrix is the authority on who --
// "View audit log": ADMIN / HR_LEAD (the §11 heading's own "(ADMIN)"
// parenthetical is imprecise; the matrix table is what lib/rbac.ts's
// canViewAuditLog() was already built against in an earlier stage).
export async function GET(request: Request) {
  const ctx = await requireApiContext(request);
  if (ctx instanceof Response) return ctx;
  const { session } = ctx;

  if (!canViewAuditLog(session.user.role)) {
    return forbidden("Only ADMIN or HR_LEAD may search the audit log");
  }

  const p = new URL(request.url).searchParams;
  const where: Prisma.AuditLogWhereInput = {};
  if (p.get("ticketId")) where.ticketId = p.get("ticketId")!;
  // Ticket number (what a real user actually has, not the internal uuid
  // ticketId already supported above) -- resolves to the ticket's id. A
  // ticketId column is a real Postgres uuid, so a non-matching ticket
  // number can't be expressed as a WHERE value (Prisma throws P2023, not
  // "no rows") -- short-circuit to an empty result instead.
  if (p.get("ticketNo")) {
    const ticket = await prisma.ticket.findUnique({ where: { ticketNo: p.get("ticketNo")! } });
    if (!ticket) return NextResponse.json({ entries: [] });
    where.ticketId = ticket.id;
  }
  if (p.get("actorId")) where.actorId = p.get("actorId")!;
  if (p.get("action")) where.action = { contains: p.get("action")!, mode: "insensitive" };
  if (p.get("correlationId")) where.correlationId = p.get("correlationId")!;
  const from = p.get("from");
  const to = p.get("to");
  if (from || to) {
    where.createdAt = { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) };
  }

  const entries = await prisma.auditLog.findMany({
    where,
    include: {
      actor: { select: { displayName: true, initials: true } },
      ticket: { select: { ticketNo: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  return NextResponse.json({ entries });
}
