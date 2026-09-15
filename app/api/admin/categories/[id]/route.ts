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

// §3/§13: ADMIN only -- "Manage users, roles, suppression rules,
// categories, business units." §5: "deactivated, never deleted" (isActive
// toggling exists for that reason; there is no delete path). Mirrors
// app/api/admin/business-units/[id]/route.ts exactly -- same lookup-table
// shape, same gap (no admin UI existed for this table either), built
// straight after business units at John's request (2026-09-16).
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const ctx = await requireApiContext(request);
  if (ctx instanceof Response) return ctx;
  const { session, correlationId } = ctx;
  if (!canManageAdminSettings(session.user.role)) return forbidden();

  const target = await prisma.category.findUnique({ where: { id: params.id } });
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
    return NextResponse.json({ category: target });
  }

  if (nameChanged) {
    const collision = await prisma.category.findUnique({ where: { name: body.name!.trim() } });
    if (collision && collision.id !== target.id) {
      return badRequest(`A category named "${body.name!.trim()}" already exists`);
    }
  }

  const updated = await prisma.category.update({
    where: { id: target.id },
    data: {
      name: nameChanged ? body.name!.trim() : undefined,
      isActive: body.isActive,
    },
  });

  // §5.317: renaming the lookup row itself is distinct from a ticket's own
  // category_id changing (already covered by TICKET_METADATA_UPDATED).
  if (nameChanged) {
    await writeAuditLog({
      correlationId,
      actorId: session.user.id,
      action: "CATEGORY_RENAMED",
      entity: "category",
      entityId: target.id,
      beforeJson: { name: target.name },
      afterJson: { name: updated.name },
    });
  }
  if (activeChanged) {
    await writeAuditLog({
      correlationId,
      actorId: session.user.id,
      action: "CATEGORY_ACTIVATION_CHANGED",
      entity: "category",
      entityId: target.id,
      beforeJson: { isActive: target.isActive },
      afterJson: { isActive: updated.isActive },
    });
  }

  return NextResponse.json({ category: updated });
}
