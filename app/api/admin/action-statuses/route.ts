import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiContext } from "@/lib/api-context";
import { badRequest, forbidden } from "@/lib/http-errors";
import { canManageAdminSettings } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";

// Action items (operator addition, John 2026-10-01): ADMIN-only create.
// Mirrors app/api/admin/categories/route.ts -- same lookup-table shape,
// new entries append to the end of the list.
export async function POST(request: Request) {
  const ctx = await requireApiContext(request);
  if (ctx instanceof Response) return ctx;
  const { session, correlationId } = ctx;
  if (!canManageAdminSettings(session.user.role)) return forbidden();

  const body = (await request.json().catch(() => null)) as { name?: string } | null;
  const name = body?.name?.trim();
  if (!name) return badRequest("name is required");

  const collision = await prisma.actionStatus.findUnique({ where: { name } });
  if (collision) return badRequest(`An action item named "${name}" already exists`);

  const last = await prisma.actionStatus.findFirst({ orderBy: { sortOrder: "desc" } });
  const actionStatus = await prisma.actionStatus.create({
    data: {
      name,
      sortOrder: (last?.sortOrder ?? -1) + 1,
      createdById: session.user.id,
    },
  });

  await writeAuditLog({
    correlationId,
    actorId: session.user.id,
    action: "ACTION_STATUS_CREATED",
    entity: "action_status",
    entityId: actionStatus.id,
    afterJson: { name: actionStatus.name },
  });

  return NextResponse.json({ actionStatus }, { status: 201 });
}
