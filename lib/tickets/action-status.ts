// Action items (operator addition, John 2026-10-01): admin-managed labels
// such as "On Hold" that sit on an IN_ACTION ticket and are shown in place
// of the status. The ticket's real lifecycle status stays IN_ACTION, so
// outcome/close/merge rules are unchanged. Pure, so it's unit-testable.

import type { UserRole } from "../roles";
import { isWorkingStatus, validateTransition, type TicketStatus } from "./transitions";

export interface ActionStatusChangeContext {
  status: TicketStatus;
  currentActionStatusId: string | null;
  /** The label being set, or null to clear the current one. */
  targetActionStatusId: string | null;
  actorRole: UserRole;
  isAssignee: boolean;
  categoryId: string | null;
}

export interface ActionStatusChangeResult {
  ok: boolean;
  status?: 400 | 403;
  error?: string;
}

/**
 * Setting a label: any staff member while the ticket is IN_ACTION (same as
 * "Mark awaiting response"). From AWAITING_RESPONSE/RESPONSE_RECEIVED it also
 * moves the ticket back to IN_ACTION, so that move's own rule applies
 * (assignee/HR_LEAD/ADMIN). Clearing a label: assignee/HR_LEAD/ADMIN, the
 * same rule as "Back to in action".
 */
export function validateActionStatusChange(ctx: ActionStatusChangeContext): ActionStatusChangeResult {
  if (!isWorkingStatus(ctx.status)) {
    return { ok: false, status: 400, error: `Action items can only be set on a ticket that is in action (current status: ${ctx.status})` };
  }

  if (ctx.targetActionStatusId === null) {
    if (ctx.status !== "IN_ACTION" || ctx.currentActionStatusId === null) {
      return { ok: false, status: 400, error: "This ticket has no action item to clear" };
    }
    if (!(ctx.actorRole === "ADMIN" || ctx.actorRole === "HR_LEAD" || ctx.isAssignee)) {
      return { ok: false, status: 403, error: "Only the assignee, HR_LEAD, or ADMIN may clear an action item" };
    }
    return { ok: true };
  }

  if (ctx.status === "IN_ACTION" && ctx.targetActionStatusId === ctx.currentActionStatusId) {
    return { ok: false, status: 400, error: "This ticket already has that action item" };
  }

  if (ctx.status !== "IN_ACTION") {
    const move = validateTransition(ctx.status, "IN_ACTION", {
      actorRole: ctx.actorRole,
      isAssignee: ctx.isAssignee,
      categoryId: ctx.categoryId,
    });
    if (!move.ok) return { ok: false, status: move.status, error: move.error };
  }
  return { ok: true };
}

/** What lists and the ticket page show as the status: the action item's name while IN_ACTION, else the status. */
export function displayStatus(ticket: { status: string; actionStatus?: { name: string } | null }): string {
  if (ticket.status === "IN_ACTION" && ticket.actionStatus) return ticket.actionStatus.name;
  return ticket.status;
}
