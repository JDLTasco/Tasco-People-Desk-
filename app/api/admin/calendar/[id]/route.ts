import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiContext } from "@/lib/api-context";
import { forbidden, notFound } from "@/lib/http-errors";
import { canManageAdminSettings } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";

// Removes a non-working day (Admin -> Calendar, 2026-10-03). ADMIN only;
// the audit row keeps what was removed.
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const ctx = await requireApiContext(request);
  if (ctx instanceof Response) return ctx;
  const { session, correlationId } = ctx;
  if (!canManageAdminSettings(session.user.role)) return forbidden();

  const day = await prisma.nonWorkingDay.findUnique({ where: { id: params.id } }).catch(() => null);
  if (!day) return notFound();
  await prisma.nonWorkingDay.delete({ where: { id: day.id } });
  await writeAuditLog({
    correlationId,
    actorId: session.user.id,
    action: "CALENDAR_DATE_REMOVED",
    entity: "non_working_day",
    entityId: day.id,
    beforeJson: { date: day.date.toISOString().slice(0, 10), name: day.name, isRecurring: day.isRecurring },
  });
  return NextResponse.json({ ok: true });
}
