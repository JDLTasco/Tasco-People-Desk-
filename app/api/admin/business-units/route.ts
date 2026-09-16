import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiContext } from "@/lib/api-context";
import { badRequest, forbidden } from "@/lib/http-errors";
import { canManageAdminSettings } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";

// Mirrors app/api/admin/categories/route.ts exactly -- same lookup-table
// shape, same "added through the admin UI with no migration" spec text
// (§5), ADMIN only (§3). New entries append at the end (max sort_order + 1).
export async function POST(request: Request) {
  const ctx = await requireApiContext(request);
  if (ctx instanceof Response) return ctx;
  const { session, correlationId } = ctx;
  if (!canManageAdminSettings(session.user.role)) return forbidden();

  const body = (await request.json().catch(() => null)) as { name?: string } | null;
  const name = body?.name?.trim();
  if (!name) return badRequest("name is required");

  const collision = await prisma.businessUnit.findUnique({ where: { name } });
  if (collision) return badRequest(`A business unit named "${name}" already exists`);

  const last = await prisma.businessUnit.findFirst({ orderBy: { sortOrder: "desc" } });
  const businessUnit = await prisma.businessUnit.create({
    data: {
      name,
      sortOrder: (last?.sortOrder ?? -1) + 1,
      createdById: session.user.id,
    },
  });

  await writeAuditLog({
    correlationId,
    actorId: session.user.id,
    action: "BUSINESS_UNIT_CREATED",
    entity: "business_unit",
    entityId: businessUnit.id,
    afterJson: { name: businessUnit.name },
  });

  return NextResponse.json({ businessUnit }, { status: 201 });
}
