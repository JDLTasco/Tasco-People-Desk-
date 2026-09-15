import { prisma } from "./prisma";
import type { AccessBasis } from "@prisma/client";

// The one place every mutation writes to audit_log. §5: "Actions that must
// be audit-logged, at minimum: every status transition, reassignment,
// category change, business unit change, target due date change, priority
// change, note creation and revision, ... ." audit_log itself is
// append-only at the database (Stage 1's app_role grants) -- this helper
// only ever INSERTs, matching that.
export interface AuditLogEntry {
  correlationId: string;
  actorId: string;
  action: string;
  entity: string;
  entityId: string;
  ticketId?: string;
  beforeJson?: unknown;
  afterJson?: unknown;
  reason?: string;
  accessBasis?: AccessBasis;
  ip?: string;
  userAgent?: string;
}

export async function writeAuditLog(entry: AuditLogEntry): Promise<void> {
  await prisma.auditLog.create({
    data: {
      correlationId: entry.correlationId,
      actorId: entry.actorId,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      ticketId: entry.ticketId,
      beforeJson: entry.beforeJson === undefined ? undefined : (entry.beforeJson as object),
      afterJson: entry.afterJson === undefined ? undefined : (entry.afterJson as object),
      reason: entry.reason,
      accessBasis: entry.accessBasis,
      ip: entry.ip,
      userAgent: entry.userAgent,
    },
  });
}
