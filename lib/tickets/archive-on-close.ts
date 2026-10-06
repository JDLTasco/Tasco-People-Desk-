// "Close -- Info only" (close reason NOT_A_REQUEST) and "Close -- Autoclose"
// archive the ticket straight away (John, 2026-10-03): they're closed with
// no priority/category/target date needed and go straight to the archive,
// skipping the 2 working-day reply window every other closed ticket gets
// (lib/tickets/reopen.ts). If the archive write fails the ticket stays
// CLOSED and the nightly archive-closed job retries it (it picks these
// close reasons up regardless of age).
import { archiveTicket } from "../archive/writer";
import { writeAuditLog } from "../audit";
import { writeStatusHistory } from "./history";

export const IMMEDIATE_ARCHIVE_CLOSE_REASONS = ["NOT_A_REQUEST", "AUTOCLOSE"] as const;

export const CLOSE_REASON_LABELS: Record<string, string> = {
  NOT_A_REQUEST: "Info only",
  AUTOCLOSE: "Autoclose",
};

export async function archiveNowAfterClose(params: {
  ticketId: string;
  closeReason: (typeof IMMEDIATE_ARCHIVE_CLOSE_REASONS)[number];
  actorId: string;
  correlationId: string;
}): Promise<{ archived: boolean; error?: string }> {
  const result = await archiveTicket(params.ticketId);
  if (!result.ok) return { archived: false, error: result.error };

  const label = CLOSE_REASON_LABELS[params.closeReason];
  await writeStatusHistory({
    ticketId: params.ticketId,
    fromStatus: "CLOSED",
    toStatus: "ARCHIVED",
    actorId: params.actorId,
    reason: `Archived immediately on "${label}" close`,
    correlationId: params.correlationId,
  });
  await writeAuditLog({
    correlationId: params.correlationId,
    actorId: params.actorId,
    action: "TICKET_ARCHIVED",
    entity: "ticket",
    entityId: params.ticketId,
    ticketId: params.ticketId,
    beforeJson: { status: "CLOSED" },
    afterJson: { status: "ARCHIVED", trigger: "IMMEDIATE_ON_CLOSE", closeReason: params.closeReason },
  });
  return { archived: true };
}
