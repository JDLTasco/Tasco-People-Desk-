import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiContext } from "@/lib/api-context";
import { badRequest, forbidden } from "@/lib/http-errors";
import { canManageAdminSettings } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";

// §5: "New categories are added through the admin UI with no migration."
// ADMIN only, per §3. New entries sort to the end of the existing list
// (max sort_order + 1) -- the spec doesn't say how sort_order should be
// assigned for an admin-added row, and "append at the end" is the
// obviously safe default; nothing here reorders existing categories.
export async function POST(request: Request) {
  const ctx = await requireApiContext(request);
  if (ctx instanceof Response) return ctx;
  const { session, correlationId } = ctx;
  if (!canManageAdminSettings(session.user.role)) return forbidden();

  const body = (await request.json().catch(() => null)) as { name?: string } | null;
  const name = body?.name?.trim();
  if (!name) return badRequest("name is required");

  const collision = await prisma.category.findUnique({ where: { name } });
  if (collision) return badRequest(`A category named "${name}" already exists`);

  const last = await prisma.category.findFirst({ orderBy: { sortOrder: "desc" } });
  const category = await prisma.category.create({
    data: {
      name,
      sortOrder: (last?.sortOrder ?? -1) + 1,
      createdById: session.user.id,
    },
  });

  await writeAuditLog({
    correlationId,
    actorId: session.user.id,
    action: "CATEGORY_CREATED",
    entity: "category",
    entityId: category.id,
    afterJson: { name: category.name },
  });

  return NextResponse.json({ category }, { status: 201 });
}
