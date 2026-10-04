import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiContext } from "@/lib/api-context";
import { badRequest, forbidden, notFound } from "@/lib/http-errors";
import { canManageAdminSettings } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";
import { removeExistingCopies } from "@/lib/attachments/ignored-image-tidy";

interface Body {
  sha256?: string;
  attachmentId?: string;
  label?: string;
}

// Ignored images (John, 2026-10-05): ADMIN-only add, by hash (from the
// Admin -> Ignored images suggestions) or by attachment (the ticket page's
// "Always ignore" link). Re-adding a switched-off entry turns it back on.
// Either way, copies already on tickets are tidied off (see
// lib/attachments/ignored-image-tidy.ts).
export async function POST(request: Request) {
  const ctx = await requireApiContext(request);
  if (ctx instanceof Response) return ctx;
  const { session, correlationId } = ctx;
  if (!canManageAdminSettings(session.user.role)) return forbidden();

  const body = (await request.json().catch(() => null)) as Body | null;
  let sha256 = body?.sha256?.trim().toLowerCase();
  let exampleFilename: string | null = null;
  if (body?.attachmentId) {
    const attachment = await prisma.ticketAttachment.findUnique({ where: { id: body.attachmentId } });
    if (!attachment) return notFound();
    sha256 = attachment.sha256;
    exampleFilename = attachment.filename;
  }
  if (!sha256 || !/^[0-9a-f]{64}$/.test(sha256)) return badRequest("sha256 or attachmentId is required");

  const example = await prisma.ticketAttachment.findFirst({ where: { sha256 }, orderBy: { createdAt: "desc" } });
  if (!example) return badRequest("No attachment with that image has been received");
  const type = example.detectedContentType ?? example.declaredContentType ?? "";
  if (!type.toLowerCase().startsWith("image/")) return badRequest("Only images can be ignored");
  exampleFilename ??= example.filename;
  const label = body?.label?.trim().slice(0, 200) || exampleFilename;

  const existing = await prisma.ignoredImage.findUnique({ where: { sha256 } });
  let image;
  if (existing) {
    if (existing.isActive) {
      return NextResponse.json({ image: existing, alreadyActive: true, removed: await removeExistingCopies(sha256, session.user.id, correlationId) });
    }
    image = await prisma.ignoredImage.update({ where: { id: existing.id }, data: { isActive: true } });
    await writeAuditLog({
      correlationId,
      actorId: session.user.id,
      action: "IGNORED_IMAGE_ACTIVATION_CHANGED",
      entity: "ignored_image",
      entityId: image.id,
      beforeJson: { isActive: false },
      afterJson: { isActive: true, label: image.label },
    });
  } else {
    image = await prisma.ignoredImage.create({
      data: { sha256, label, exampleFilename, createdBy: session.user.id },
    });
    await writeAuditLog({
      correlationId,
      actorId: session.user.id,
      action: "IGNORED_IMAGE_CREATED",
      entity: "ignored_image",
      entityId: image.id,
      afterJson: { sha256, label, exampleFilename },
    });
  }

  const removed = await removeExistingCopies(sha256, session.user.id, correlationId);
  return NextResponse.json({ image, removed }, { status: existing ? 200 : 201 });
}
