import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiContext } from "@/lib/api-context";
import { badRequest, forbidden, notFound } from "@/lib/http-errors";
import { canManageAdminSettings } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";

// Block list (John, 2026-10-05): ADMIN-only switch off / turn back on.
// Switched off, never deleted. A switched-off rule blocks nothing from then
// on; emails it already blocked stay in hrtickets@ and come in on the next
// import, since nothing about them was recorded as processed.
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const ctx = await requireApiContext(request);
  if (ctx instanceof Response) return ctx;
  const { session, correlationId } = ctx;
  if (!canManageAdminSettings(session.user.role)) return forbidden();

  const target = await prisma.suppressionRule.findUnique({ where: { id: params.id } });
  if (!target) return notFound();

  const body = (await request.json().catch(() => null)) as { isActive?: boolean } | null;
  if (typeof body?.isActive !== "boolean") return badRequest("isActive is required");
  if (body.isActive === target.isActive) return NextResponse.json({ rule: target });

  const rule = await prisma.suppressionRule.update({ where: { id: target.id }, data: { isActive: body.isActive } });
  await writeAuditLog({
    correlationId,
    actorId: session.user.id,
    action: "SUPPRESSION_RULE_ACTIVATION_CHANGED",
    entity: "suppression_rule",
    entityId: rule.id,
    beforeJson: { isActive: target.isActive },
    afterJson: { isActive: rule.isActive, type: rule.type, value: rule.value },
  });
  return NextResponse.json({ rule });
}
