import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiContext } from "@/lib/api-context";
import { badRequest, forbidden } from "@/lib/http-errors";
import { canManageAdminSettings } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";
import { parseCalendarDate } from "@/lib/calendar/admin";

// Admin -> Calendar (John, 2026-10-03): non-working days used by the
// automatic target due date. ADMIN only. Adding a date affects targets
// calculated from now on; existing tickets' targets are never rewritten.
export async function GET(request: Request) {
  const ctx = await requireApiContext(request);
  if (ctx instanceof Response) return ctx;
  if (!canManageAdminSettings(ctx.session.user.role)) return forbidden();
  const days = await prisma.nonWorkingDay.findMany({ orderBy: { date: "asc" } });
  return NextResponse.json({ days });
}

export async function POST(request: Request) {
  const ctx = await requireApiContext(request);
  if (ctx instanceof Response) return ctx;
  const { session, correlationId } = ctx;
  if (!canManageAdminSettings(session.user.role)) return forbidden();

  const body = (await request.json().catch(() => null)) as { date?: string; name?: string; isRecurring?: boolean } | null;
  const date = parseCalendarDate(body?.date);
  if (!date) return badRequest("date must be a valid date (YYYY-MM-DD)");
  const name = body?.name?.trim();
  if (!name) return badRequest("name is required");
  if (name.length > 100) return badRequest("name must be 100 characters or fewer");
  const isRecurring = body?.isRecurring === true;

  const existing = await prisma.nonWorkingDay.findUnique({ where: { date } });
  if (existing) return badRequest(`${body!.date} is already listed (${existing.name})`);

  const day = await prisma.nonWorkingDay.create({ data: { date, name, isRecurring, createdBy: session.user.id } });
  await writeAuditLog({
    correlationId,
    actorId: session.user.id,
    action: "CALENDAR_DATE_ADDED",
    entity: "non_working_day",
    entityId: day.id,
    afterJson: { date: body!.date, name, isRecurring },
  });
  return NextResponse.json({ day }, { status: 201 });
}
