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
 * Whether a newly arrived verdict may replace the attachment's current
 * status. PENDING always may. The one terminal status that may be replaced
 * is BLOCKED/SCAN_TIMEOUT, and only by a real Defender verdict (never by
 * another timeout): a timeout means "no answer arrived in time", not "this
 * file is unsafe" -- found live 2026-09-24, when Defender malware scanning
 * had never been switched on, so every real attachment timed out and could
 * never be opened even after scanning was enabled. MALICIOUS, CLEAN and
 * SCAN_UNAVAILABLE are real verdicts and stay final. Still fail-closed: the
 * file only becomes downloadable if the real verdict is CLEAN.
 */
export function canApplyVerdict(
  current: { scanStatus: ScanStatus; blockReason: string | null },
  verdict: RawScanVerdict,
): boolean {
  if (current.scanStatus === "PENDING") return true;
  return current.scanStatus === "BLOCKED" && current.blockReason === "SCAN_TIMEOUT" && verdict !== "SCAN_TIMEOUT";
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
  if (!attachment || !canApplyVerdict(attachment, verdict)) {
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
    beforeJson: { scanStatus: attachment.scanStatus, blockReason: attachment.blockReason },
    afterJson: { scanStatus, blockReason, verdict },
  });

  return { applied: true, attachmentId: attachment.id };
}
