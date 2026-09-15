import { prisma } from "../prisma";
import type { TicketStatus } from "./transitions";

export interface StatusHistoryEntry {
  ticketId: string;
  fromStatus: TicketStatus | null;
  toStatus: TicketStatus;
  fromAssignee?: string | null;
  toAssignee?: string | null;
  actorId: string;
  reason?: string;
  correlationId: string;
}

export async function writeStatusHistory(entry: StatusHistoryEntry): Promise<void> {
  await prisma.ticketStatusHistory.create({
    data: {
      ticketId: entry.ticketId,
      fromStatus: entry.fromStatus ?? undefined,
      toStatus: entry.toStatus,
      fromAssignee: entry.fromAssignee,
      toAssignee: entry.toAssignee,
      actorId: entry.actorId,
      reason: entry.reason,
      correlationId: entry.correlationId,
    },
  });
}
