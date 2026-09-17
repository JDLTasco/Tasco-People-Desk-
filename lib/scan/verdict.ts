import { prisma } from "../prisma";
import { writeAuditLog } from "../audit";
import { getSystemUserId } from "../ingestion/process-message";
import type { ScanStatus } from "@prisma/client";

// §7.3.2: the two verdict sources (Event Grid webhook, blob index tag
// reconciliation) map the same underlying Defender for Storage result to
// the same three-way outcome, so both call this one function rather than
// each encoding the mapping and the "never overwrite a terminal verdict"
// guard separately.
export type RawScanVerdict = "CLEAN" | "MALICIOUS" | "SCAN_UNAVAILABLE" | "SCAN_TIMEOUT";

const VERDICT_TO_STATUS: Record<RawScanVerdict, { scanStatus: ScanStatus; blockReason: string | null }> = {
  CLEAN: { scanStatus: "CLEAN", blockReason: null },
  MALICIOUS: { scanStatus: "MALICIOUS", blockReason: null },
  SCAN_UNAVAILABLE: { scanStatus: "BLOCKED", blockReason: "SCAN_UNAVAILABLE" },
  SCAN_TIMEOUT: { scanStatus: "BLOCKED", blockReason: "SCAN_TIMEOUT" },
};

/** Defender's own scan-result string, from either the Event Grid event payload or the blob index tag -- same values, same mapping (§7.3.2). */
export function mapDefenderVerdict(raw: string): RawScanVerdict | null {
  switch (raw) {
    case "No threats found":
      return "CLEAN";
    case "Malicious":
      return "MALICIOUS";
    case "Error":
    case "Not scanned":
      return "SCAN_UNAVAILABLE";
    default:
      return null;
  }
}

/**
 * Applies a scan verdict to the attachment at `blobPath`, if it exists and
 * is still `PENDING`. "Fail closed... never default to CLEAN" (§7.3.2) cuts
 * both ways here: a terminal verdict already recorded is never overwritten
 * either, so a delayed duplicate delivery (webhook after reconcile already
 * resolved it, or vice versa) can't flip a MALICIOUS attachment back.
 */
export async function applyScanVerdict(
  blobPath: string,
  verdict: RawScanVerdict,
  correlationId: string,
): Promise<{ applied: boolean; attachmentId?: string }> {
  const attachment = await prisma.ticketAttachment.findFirst({ where: { blobPath } });
  if (!attachment || attachment.scanStatus !== "PENDING") {
    return { applied: false };
  }

  const { scanStatus, blockReason } = VERDICT_TO_STATUS[verdict];
  await prisma.ticketAttachment.update({
    where: { id: attachment.id },
    data: { scanStatus, blockReason },
  });

  const systemUserId = await getSystemUserId();
  await writeAuditLog({
    correlationId,
    actorId: systemUserId,
    action: "ATTACHMENT_SCAN_VERDICT",
    entity: "ticket_attachment",
    entityId: attachment.id,
    ticketId: attachment.ticketId,
    beforeJson: { scanStatus: "PENDING" },
    afterJson: { scanStatus, blockReason, verdict },
  });

  return { applied: true, attachmentId: attachment.id };
}
