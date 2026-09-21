import { prisma } from "@/lib/prisma";
import { requireApiContext } from "@/lib/api-context";
import { notFound, conflict } from "@/lib/http-errors";
import { loadTicketForViewer } from "@/lib/tickets/detail";
import { blobStore } from "@/lib/blob-store";

// §7.3.1: "No attachment is downloadable while scan_status is PENDING.
// MALICIOUS and BLOCKED are never downloadable ... Fail closed ... never
// default to CLEAN" -- SKIPPED (inline signature images, never actually
// scanned) is held to the same fail-closed rule even though the spec
// doesn't name it explicitly, since it was never a verdict either.
// CLEAN is the only downloadable state.
//
// Access: loadTicketForViewer(), the same confidential-ACL gate (§9) the
// export route and the upload route both use -- 404 for a confidential
// ticket this user can't see, never a 403.
export async function GET(request: Request, { params }: { params: { id: string; attachmentId: string } }) {
  const ctx = await requireApiContext(request);
  if (ctx instanceof Response) return ctx;
  const { session } = ctx;

  const viewable = await loadTicketForViewer(params.id, session.user.id, session.user.role);
  if (!viewable) return notFound();

  const attachment = await prisma.ticketAttachment.findUnique({ where: { id: params.attachmentId } });
  // Scoped to this ticket -- an attachment id from a different ticket must
  // 404 exactly like one that doesn't exist at all, never confirm it
  // belongs elsewhere.
  if (!attachment || attachment.ticketId !== viewable.id) return notFound();

  if (attachment.scanStatus !== "CLEAN") {
    return conflict(`This attachment is not downloadable (${attachment.scanStatus}${attachment.blockReason ? `: ${attachment.blockReason}` : ""})`, {
      scanStatus: attachment.scanStatus,
      blockReason: attachment.blockReason,
    });
  }

  const content = await blobStore.read(attachment.blobPath);
  // Served as octet-stream regardless of the file's real type, same as
  // how blob-client.ts's AzureBlobStore.save() always writes it -- forces
  // a download rather than in-browser rendering, avoiding any risk of a
  // scanned-but-still-attacker-authored file (e.g. an HTML/SVG payload)
  // executing inline in the viewer's browser.
  return new Response(new Uint8Array(content), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${attachment.filename}"`,
      "Content-Length": String(attachment.sizeBytes),
    },
  });
}
