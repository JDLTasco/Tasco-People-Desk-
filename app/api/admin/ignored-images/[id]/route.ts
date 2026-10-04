import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiContext } from "@/lib/api-context";
import { badRequest, forbidden, notFound } from "@/lib/http-errors";
import { canManageAdminSettings } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";
import { removeExistingCopies, restoreTidiedCopies } from "@/lib/attachments/ignored-image-tidy";

// Ignored images (John, 2026-10-05): ADMIN-only switch off / turn back on.
// Off puts back the copies the ignore list tidied off tickets; on tidies
// them off again. Never deleted.
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const ctx = await requireApiContext(request);
  if (ctx instanceof Response) return ctx;
  const { session, correlationId } = ctx;
  if (!canManageAdminSettings(session.user.role)) return forbidden();

  const target = await prisma.ignoredImage.findUnique({ where: { id: params.id } });
  if (!target) return notFound();

  const body = (await request.json().catch(() => null)) as { isActive?: boolean } | null;
  if (typeof body?.isActive !== "boolean") return badRequest("isActive is required");
  if (body.isActive === target.isActive) return NextResponse.json({ image: target });

  const image = await prisma.ignoredImage.update({ where: { id: target.id }, data: { isActive: body.isActive } });
  await writeAuditLog({
    correlationId,
    actorId: session.user.id,
    action: "IGNORED_IMAGE_ACTIVATION_CHANGED",
    entity: "ignored_image",
    entityId: image.id,
    beforeJson: { isActive: target.isActive },
    afterJson: { isActive: image.isActive, label: image.label },
  });

  const changed = image.isActive
    ? await removeExistingCopies(image.sha256, session.user.id, correlationId)
    : await restoreTidiedCopies(image.sha256, session.user.id, correlationId);
  return NextResponse.json({ image, ...(image.isActive ? { removed: changed } : { restored: changed }) });
}
