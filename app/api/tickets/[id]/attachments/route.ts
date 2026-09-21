import { createHash, randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiContext } from "@/lib/api-context";
import { badRequest, notFound } from "@/lib/http-errors";
import { writeAuditLog } from "@/lib/audit";
import { loadTicketForViewer } from "@/lib/tickets/detail";
import { blobStore } from "@/lib/blob-store";
import { validateAttachment } from "@/lib/ingestion/attachments";

// §13's ticket-detail page lists "staff upload" as an Attachments capability,
// and the schema (`ticket_attachments.source` = EMAIL / UPLOAD, `uploaded_by`)
// was already built for it -- this is the first route that actually writes
// an UPLOAD-source row. Deliberately reuses every piece of the email
// ingestion path unchanged (lib/ingestion/attachments.ts's validateAttachment,
// blobStore, the same blob_path shape) rather than a parallel implementation,
// so a manually uploaded file goes through the identical Defender scan
// pipeline (Event Grid webhook + attachment-scan-reconcile job, both keyed
// off scan_status/blob_path with no source filter -- see
// app/api/jobs/attachment-scan-reconcile/route.ts) with nothing new to keep
// in sync.
//
// Access: loadTicketForViewer(), the same confidential-ACL gate the export
// route uses (404 for a confidential ticket this user can't see, never a
// 403 -- §9) -- stricter than notes/route.ts's bare existence check, chosen
// deliberately here since an upload is a new write path being added, not an
// existing convention being followed.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const ctx = await requireApiContext(request);
  if (ctx instanceof Response) return ctx;
  const { session, correlationId } = ctx;

  const viewable = await loadTicketForViewer(params.id, session.user.id, session.user.role);
  if (!viewable) return notFound();

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!file || !(file instanceof File)) {
    return badRequest("file is required (multipart/form-data)");
  }
  if (file.size === 0) {
    return badRequest("file is empty");
  }

  const content = Buffer.from(await file.arrayBuffer());
  const validation = validateAttachment({
    filename: file.name,
    declaredContentType: file.type || "application/octet-stream",
    sizeBytes: file.size,
    content,
    isInline: false,
  });
  const sha256 = createHash("sha256").update(content).digest("hex");
  // No message_id (this isn't part of an email thread) -- a random segment
  // keeps the path unique across repeated uploads of the same filename to
  // the same ticket, mirroring the email path's use of message_id for the
  // same purpose.
  const blobPath = `attachments/${viewable.id}/manual/${randomUUID()}/${file.name}`;
  await blobStore.save(blobPath, content);

  const record = await prisma.ticketAttachment.create({
    data: {
      ticketId: viewable.id,
      messageId: null,
      filename: file.name,
      declaredContentType: file.type || "application/octet-stream",
      detectedContentType: validation.detectedContentType,
      sizeBytes: file.size,
      blobPath,
      sha256,
      source: "UPLOAD",
      scanStatus: validation.scanStatus,
      blockReason: validation.blockReason,
      uploadedById: session.user.id,
    },
  });

  if (validation.scanStatus === "BLOCKED") {
    // Nothing silently lost (§7.3.1) applies here too -- a note documents
    // why it's not on the ticket, same as the email path's equivalent case.
    await prisma.ticketNote.create({
      data: {
        ticketId: viewable.id,
        authorId: session.user.id,
        body: `Attachment "${file.name}" was blocked (${validation.blockReason}) and is not available on this ticket.`,
      },
    });
    await writeAuditLog({
      correlationId,
      actorId: session.user.id,
      action: "ATTACHMENT_BLOCKED",
      entity: "ticket_attachment",
      entityId: record.id,
      ticketId: viewable.id,
      afterJson: { filename: file.name, blockReason: validation.blockReason },
    });
  } else {
    await writeAuditLog({
      correlationId,
      actorId: session.user.id,
      action: "TICKET_ATTACHMENT_UPLOADED",
      entity: "ticket_attachment",
      entityId: record.id,
      ticketId: viewable.id,
      afterJson: { filename: file.name, scanStatus: validation.scanStatus },
    });
  }

  return NextResponse.json(
    { attachment: record, blocked: validation.scanStatus === "BLOCKED", blockReason: validation.blockReason },
    { status: 201 },
  );
}
