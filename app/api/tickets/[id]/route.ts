import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiContext } from "@/lib/api-context";
import { badRequest, conflict, notFound } from "@/lib/http-errors";
import { canActOnAssignedTicket } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";
import { TICKET_DETAIL_INCLUDE as DETAIL_INCLUDE, loadTicketForViewer } from "@/lib/tickets/detail";
import { SLA_HOURS } from "@/lib/tickets/sla";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const ctx = await requireApiContext(request);
  if (ctx instanceof Response) return ctx;
  const { session } = ctx;

  // loadTicketForViewer() also performs §4's first-view stamp -- see its
  // own doc comment for why that lives there rather than here.
  const ticket = await loadTicketForViewer(params.id, session.user.id, session.user.role);
  if (!ticket) return notFound();

  // Note: §9.1's CONFIDENTIAL_TICKET_VIEWED audit logging (with
  // access_basis) is Stage 6's own deliverable, not built here -- the 404
  // gate in loadTicketForViewer is the Stage 3 concern (a working ticket
  // detail can't leak confidential data), the audit trail for it is
  // deferred deliberately.

  return NextResponse.json({ ticket });
}

interface PatchBody {
  version: number;
  subject?: string;
  priority?: "P1" | "P2" | "P3";
  ccRecipients?: string[];
  categoryId?: string | null;
  businessUnitId?: string | null;
  targetDueAt?: string | null;
  targetDueReason?: string | null;
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const ctx = await requireApiContext(request);
  if (ctx instanceof Response) return ctx;
  const { session, correlationId } = ctx;

  const current = await prisma.ticket.findUnique({ where: { id: params.id } });
  if (!current || current.isDeleted) return notFound();

  const body = (await request.json()) as PatchBody;
  if (typeof body.version !== "number") {
    return badRequest("version is required for optimistic locking");
  }

  // target_due_at/target_due_reason are settable by any authenticated
  // staff member, not just the ticket's assignee -- broadened at John's
  // request (2026-09-16, not in the original v1.3 §5 text, which named
  // "the assignee, HR_LEAD or ADMIN" specifically; see STATUS.md).
  // Every other metadata field (subject, priority, category, business
  // unit, cc) stays under the original assignee-or-lead/admin gate.
  const touchesRestrictedFields =
    body.subject !== undefined ||
    body.priority !== undefined ||
    body.ccRecipients !== undefined ||
    body.categoryId !== undefined ||
    body.businessUnitId !== undefined;
  const isAssignedTicket = current.assignedToId === session.user.id;
  if (touchesRestrictedFields && !canActOnAssignedTicket(session.user.role, isAssignedTicket)) {
    return badRequest("Not permitted to edit this ticket's metadata");
  }

  // §5: "target_due_reason is mandatory whenever target_due_at is set."
  const settingTargetDue = body.targetDueAt !== undefined;
  const effectiveTargetDueAt = settingTargetDue ? body.targetDueAt : current.targetDueAt?.toISOString() ?? null;
  const effectiveTargetDueReason = body.targetDueReason !== undefined ? body.targetDueReason : current.targetDueReason;
  if (effectiveTargetDueAt && !effectiveTargetDueReason) {
    return badRequest("target_due_reason is required whenever target_due_at is set");
  }

  const data: Record<string, unknown> = {};
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};

  function setField(field: string, dataKey: string, newValue: unknown, oldValue: unknown) {
    if (newValue === undefined) return;
    data[dataKey] = newValue;
    before[field] = oldValue;
    after[field] = newValue;
  }

  if (body.subject !== undefined) setField("subject", "subject", body.subject, current.subject);
  if (body.ccRecipients !== undefined) setField("ccRecipients", "ccRecipients", body.ccRecipients, current.ccRecipients);
  if (body.categoryId !== undefined) setField("categoryId", "categoryId", body.categoryId, current.categoryId);
  if (body.businessUnitId !== undefined)
    setField("businessUnitId", "businessUnitId", body.businessUnitId, current.businessUnitId);

  if (body.priority !== undefined && body.priority !== current.priority) {
    setField("priority", "priority", body.priority, current.priority);
    // §5: "sla_due_at ... Recalculated whenever priority changes."
    const newSlaDueAt = new Date(current.receivedAt.getTime() + SLA_HOURS[body.priority] * 60 * 60 * 1000);
    setField("slaDueAt", "slaDueAt", newSlaDueAt.toISOString(), current.slaDueAt.toISOString());
  }

  if (body.targetDueAt !== undefined) {
    setField("targetDueAt", "targetDueAt", body.targetDueAt, current.targetDueAt?.toISOString() ?? null);
  }
  if (body.targetDueReason !== undefined) {
    setField("targetDueReason", "targetDueReason", body.targetDueReason, current.targetDueReason);
  }

  if (Object.keys(data).length === 0) {
    return badRequest("No recognized fields to update");
  }

  const result = await prisma.ticket.updateMany({
    where: { id: current.id, version: body.version },
    data: { ...data, version: { increment: 1 } },
  });

  if (result.count === 0) {
    const latest = await prisma.ticket.findUnique({ where: { id: current.id } });
    return conflict("This ticket changed since it was loaded -- reload and retry", latest);
  }

  await writeAuditLog({
    correlationId,
    actorId: session.user.id,
    action: "TICKET_METADATA_UPDATED",
    entity: "ticket",
    entityId: current.id,
    ticketId: current.id,
    beforeJson: before,
    afterJson: after,
  });

  const updated = await prisma.ticket.findUnique({ where: { id: current.id }, include: DETAIL_INCLUDE });
  return NextResponse.json({ ticket: updated });
}
