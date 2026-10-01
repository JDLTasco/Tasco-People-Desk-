import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiContext } from "@/lib/api-context";
import { badRequest, forbidden, notFound } from "@/lib/http-errors";
import { canManageAdminSettings } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";

interface PatchBody {
  name?: string;
  isActive?: boolean;
}

// Action items (operator addition, John 2026-10-01): ADMIN-only rename and
// deactivate/restore. Mirrors app/api/admin/categories/[id]/route.ts --
// deactivated, never deleted. Tickets already carrying a deactivated item
// keep it until it's cleared or the status changes; it just stops being
// offered as a button.
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const ctx = await requireApiContext(request);
  if (ctx instanceof Response) return ctx;
  const { session, correlationId } = ctx;
  if (!canManageAdminSettings(session.user.role)) return forbidden();

  const target = await prisma.actionStatus.findUnique({ where: { id: params.id } });
  if (!target) return notFound();

  const body = (await request.json().catch(() => null)) as PatchBody | null;
  if (!body || (body.name === undefined && body.isActive === undefined)) {
    return badRequest("name and/or isActive is required");
  }
  if (body.name !== undefined && !body.name.trim()) {
    return badRequest("name cannot be blank");
  }

  const nameChanged = body.name !== undefined && body.name.trim() !== target.name;
  const activeChanged = body.isActive !== undefined && body.isActive !== target.isActive;

  if (!nameChanged && !activeChanged) {
    return NextResponse.json({ actionStatus: target });
  }

  if (nameChanged) {
    const collision = await prisma.actionStatus.findUnique({ where: { name: body.name!.trim() } });
    if (collision && collision.id !== target.id) {
      return badRequest(`An action item named "${body.name!.trim()}" already exists`);
    }
  }

  const updated = await prisma.actionStatus.update({
    where: { id: target.id },
    data: {
      name: nameChanged ? body.name!.trim() : undefined,
      isActive: body.isActive,
    },
  });

  if (nameChanged) {
    await writeAuditLog({
      correlationId,
      actorId: session.user.id,
      action: "ACTION_STATUS_RENAMED",
      entity: "action_status",
      entityId: target.id,
      beforeJson: { name: target.name },
      afterJson: { name: updated.name },
    });
  }
  if (activeChanged) {
    await writeAuditLog({
      correlationId,
      actorId: session.user.id,
      action: "ACTION_STATUS_ACTIVATION_CHANGED",
      entity: "action_status",
      entityId: target.id,
      beforeJson: { isActive: target.isActive },
      afterJson: { isActive: updated.isActive },
    });
  }

  return NextResponse.json({ actionStatus: updated });
}
