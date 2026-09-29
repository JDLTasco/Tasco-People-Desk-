// Reopening a closed ticket -- operator addition (John, 2026-09-29, not in
// the v1.4 spec). Any HR staff member may reopen a CLOSED ticket within
// REOPEN_WINDOW_DAYS of its closure, with a mandatory reason. To keep that
// window open, the nightly archive job now only archives tickets closed
// more than REOPEN_WINDOW_DAYS ago (was: every CLOSED ticket, next night).
// Pure functions only, same convention as transitions.ts.

import type { TicketStatus } from "./transitions";

export const REOPEN_WINDOW_DAYS = 30;
const WINDOW_MS = REOPEN_WINDOW_DAYS * 24 * 60 * 60 * 1000;

/** Tickets closed before this instant are past the reopen window, and so are due for archiving. */
export function reopenWindowCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - WINDOW_MS);
}

export function validateReopen(
  ticket: { status: TicketStatus; closedAt: Date | null; mergedIntoTicketId: string | null },
  now: Date = new Date(),
): { ok: boolean; error?: string } {
  if (ticket.status !== "CLOSED") {
    return { ok: false, error: `Only a CLOSED ticket can be reopened (current status: ${ticket.status})` };
  }
  if (ticket.mergedIntoTicketId) {
    return { ok: false, error: "This ticket was merged into another ticket -- work on that ticket instead" };
  }
  if (!ticket.closedAt || ticket.closedAt < reopenWindowCutoff(now)) {
    return { ok: false, error: `Tickets can only be reopened within ${REOPEN_WINDOW_DAYS} days of being closed` };
  }
  return { ok: true };
}

/**
 * Where a reopened ticket goes (John's choice): back to its assignee, IN_ACTION.
 * IN_ACTION still needs a category (§4 guard), so an assigned ticket with no
 * category goes to ALLOCATED instead; a never-assigned ticket (e.g. closed
 * "Not a request" straight from the Pool) goes back to the Pool as NEW.
 */
export function reopenTargetStatus(ticket: { assignedToId: string | null; categoryId: string | null }): TicketStatus {
  if (!ticket.assignedToId) return "NEW";
  if (!ticket.categoryId) return "ALLOCATED";
  return "IN_ACTION";
}
