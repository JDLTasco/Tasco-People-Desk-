// The ticket state machine, §4. Enforced server-side -- "the UI must not
// be the only guard." Every route handler that changes ticket.status must
// go through validateTransition() first; nothing here touches the
// database, so it's fully unit-testable.

import type { UserRole } from "../roles";

export type TicketStatus =
  | "NEW"
  | "ALLOCATED"
  | "IN_ACTION"
  | "AWAITING_RESPONSE"
  | "RESPONSE_RECEIVED"
  | "OUTCOME"
  | "CLOSED"
  | "ARCHIVED";

/**
 * Operator amendment (John, 2026-09-29): AWAITING_RESPONSE and
 * RESPONSE_RECEIVED are sub-steps of IN_ACTION -- work is underway, the
 * officer is either waiting on the requester or a response has come in.
 * Anywhere IN_ACTION was accepted (outcome dispatch, closes, merge,
 * reassignment) these are accepted too.
 */
export const WORKING_STATUSES: readonly TicketStatus[] = ["IN_ACTION", "AWAITING_RESPONSE", "RESPONSE_RECEIVED"];

export function isWorkingStatus(status: TicketStatus): boolean {
  return WORKING_STATUSES.includes(status);
}

/** Every status that isn't CLOSED/ARCHIVED -- the "open" set used by list views. */
export const OPEN_STATUSES: TicketStatus[] = ["NEW", "ALLOCATED", ...WORKING_STATUSES, "OUTCOME"];

export interface TransitionContext {
  actorRole: UserRole;
  isAssignee: boolean;
  categoryId: string | null;
  /** True only for the dedicated outcome-dispatch code path (§7.4, Stage 5). Never true from the generic API. */
  viaDispatchPreview?: boolean;
  /** True only for the automated archive job (§10, Stage 6). Never true for a user-initiated request. */
  isAutomatedArchiveJob?: boolean;
}

export interface TransitionResult {
  ok: boolean;
  /** HTTP status the route handler should return on failure. */
  status?: 400 | 403;
  error?: string;
}

function ok(): TransitionResult {
  return { ok: true };
}

function fail(status: 400 | 403, error: string): TransitionResult {
  return { ok: false, status, error };
}

/**
 * Validates a single §4 transition. Reassignment (no status change),
 * "not a request" closes, and reversals are NOT handled here -- they have
 * their own validators below, since §4 explicitly lists them as "events
 * that are not transitions" or as an ADMIN-only special case.
 */
export function validateTransition(
  from: TicketStatus,
  to: TicketStatus,
  ctx: TransitionContext,
): TransitionResult {
  if (from === "NEW" && to === "ALLOCATED") {
    // "Any user (self-claim) or HR_LEAD/ADMIN (assign)" -- no further guard.
    return ok();
  }

  if (from === "ALLOCATED" && to === "IN_ACTION") {
    if (!(ctx.actorRole === "ADMIN" || ctx.actorRole === "HR_LEAD" || ctx.isAssignee)) {
      return fail(403, "Only the assignee, HR_LEAD, or ADMIN may start action on this ticket");
    }
    if (!ctx.categoryId) {
      return fail(400, "category_id must be set before a ticket can move to IN_ACTION");
    }
    return ok();
  }

  // Response sub-steps (2026-09-29): any staff member may record that the
  // ticket is waiting on the requester, or that a response came in -- the
  // whole point is that whoever takes the call can record it, not only
  // the assignee. Moving back to plain IN_ACTION is the assignee's call.
  if (to === "AWAITING_RESPONSE" && (from === "IN_ACTION" || from === "RESPONSE_RECEIVED")) {
    return ok();
  }
  if (to === "RESPONSE_RECEIVED" && (from === "IN_ACTION" || from === "AWAITING_RESPONSE")) {
    return ok();
  }
  if (to === "IN_ACTION" && (from === "AWAITING_RESPONSE" || from === "RESPONSE_RECEIVED")) {
    if (!(ctx.actorRole === "ADMIN" || ctx.actorRole === "HR_LEAD" || ctx.isAssignee)) {
      return fail(403, "Only the assignee, HR_LEAD, or ADMIN may move this ticket back to IN_ACTION");
    }
    return ok();
  }

  if (isWorkingStatus(from) && to === "OUTCOME") {
    if (!(ctx.actorRole === "ADMIN" || ctx.actorRole === "HR_LEAD" || ctx.isAssignee)) {
      return fail(403, "Only the assignee, HR_LEAD, or ADMIN may send an outcome for this ticket");
    }
    // "Only via the dispatch preview" (§7.4) -- the generic transition API
    // must never be able to do this; only the dedicated outcome-dispatch
    // endpoint (Stage 5) sets viaDispatchPreview.
    if (!ctx.viaDispatchPreview) {
      return fail(400, "OUTCOME can only be reached by sending the outcome via the dispatch preview");
    }
    return ok();
  }

  if (from === "OUTCOME" && to === "CLOSED") {
    if (!(ctx.actorRole === "ADMIN" || ctx.actorRole === "HR_LEAD" || ctx.isAssignee)) {
      return fail(403, "Only the assignee, HR_LEAD, or ADMIN may close this ticket");
    }
    return ok();
  }

  if (from === "CLOSED" && to === "ARCHIVED") {
    if (!ctx.isAutomatedArchiveJob) {
      return fail(400, "ARCHIVED is only ever set by the automated archive job");
    }
    return ok();
  }

  return fail(400, `Invalid transition: ${from} -> ${to}`);
}

/** "Not a request" close (§4): from NEW, ALLOCATED, or IN_ACTION (incl. its response sub-steps) only. */
export function validateNotARequestClose(from: TicketStatus): TransitionResult {
  if (from === "NEW" || from === "ALLOCATED" || isWorkingStatus(from)) {
    return ok();
  }
  return fail(400, `"Not a request" close is only valid from NEW, ALLOCATED, or IN_ACTION (current status: ${from})`);
}

/**
 * Ticket merging (added directly with John, Sep 2026 -- not in the
 * original v1.3 spec; see STATUS.md). Not a transition table row -- this
 * validates the pair of tickets involved, not a single from/to move.
 * Mergeable-away statuses mirror validateNotARequestClose()'s own set
 * (still-active workflow, the overwhelmingly common real "duplicate
 * email" case) -- a source ticket that's already CLOSED or ARCHIVED is
 * refused rather than guessing whether retroactively folding a resolved
 * matter into a still-open one is ever wanted.
 */
export function validateMerge(sourceStatus: TicketStatus, targetStatus: TicketStatus): TransitionResult {
  if (!OPEN_STATUSES.includes(sourceStatus)) {
    return fail(400, `Cannot merge a ${sourceStatus} ticket -- only open (not CLOSED/ARCHIVED) tickets can be merged away`);
  }
  if (targetStatus === "ARCHIVED") {
    return fail(400, "Cannot merge into an archived ticket");
  }
  return ok();
}

/** Reassignment (§4): not a status transition -- ALLOCATED and IN_ACTION (incl. its response sub-steps) tickets only. */
export function validateReassignment(status: TicketStatus): TransitionResult {
  if (status === "ALLOCATED" || isWorkingStatus(status)) {
    return ok();
  }
  return fail(400, `Reassignment is only valid for ALLOCATED or IN_ACTION tickets (current status: ${status})`);
}

/**
 * Reversal (§4): ADMIN only, any backward move. This validator only checks
 * that `to` is a real status earlier in the lifecycle than `from` -- the
 * route handler is responsible for the ADMIN-only check, step-up
 * re-authentication, and the mandatory reason (all cross-cutting concerns
 * from §6, not state-machine concerns).
 */
const LIFECYCLE_ORDER: TicketStatus[] = [
  "NEW",
  "ALLOCATED",
  "IN_ACTION",
  "AWAITING_RESPONSE",
  "RESPONSE_RECEIVED",
  "OUTCOME",
  "CLOSED",
  "ARCHIVED",
];

export function validateReversal(from: TicketStatus, to: TicketStatus, categoryId: string | null): TransitionResult {
  const fromIndex = LIFECYCLE_ORDER.indexOf(from);
  const toIndex = LIFECYCLE_ORDER.indexOf(to);
  if (toIndex >= fromIndex) {
    return fail(400, `Not a reversal: ${to} is not earlier in the lifecycle than ${from}`);
  }
  // "A reversal into IN_ACTION still requires a category" (§4) -- same
  // guard as the forward ALLOCATED -> IN_ACTION transition.
  if (isWorkingStatus(to) && !categoryId) {
    return fail(400, "category_id must be set before a ticket can move to IN_ACTION");
  }
  return ok();
}
