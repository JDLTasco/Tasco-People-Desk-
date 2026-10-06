// Reply windows after an outcome or a close -- operator amendment (John,
// 2026-10-06), replacing the 30-day reopen window of 2026-09-29:
//
//   OUTCOME (outcome sent)  -> no reply within REPLY_WINDOW_WORKING_DAYS of
//                              outcome_sent_at: closed automatically (RESOLVED),
//                              closed_at = the end of that window.
//   CLOSED                  -> no reply within REPLY_WINDOW_WORKING_DAYS of
//                              closed_at: archived by the nightly job.
//   A requester reply inside either window reopens the ticket automatically
//   (lib/ingestion/process-message.ts); a reply after it becomes a NEW ticket
//   that points back to the old one.
//
// "48 business hours" = 2 working days (John's choice): Monday-Friday in
// Melbourne, skipping Admin -> Calendar's non-working days, same wall-clock
// time -- the same calendar as the target due date (lib/calendar/working-days.ts).
// Staff can still Reopen a CLOSED ticket by hand inside the window, with a reason.
// Pure functions only, same convention as transitions.ts.

import type { TicketStatus } from "./transitions";
import { addWorkingDays } from "../calendar/working-days";

export const REPLY_WINDOW_WORKING_DAYS = 2;

/** When the reply window that started at `start` closes. */
export function replyWindowEnd(start: Date, holidays: Set<string>): Date {
  return addWorkingDays(start, REPLY_WINDOW_WORKING_DAYS, holidays);
}

/** True while a reply can still reopen a ticket closed (or outcome-sent) at `start`. */
export function withinReplyWindow(start: Date | null, holidays: Set<string>, now: Date = new Date()): boolean {
  return !!start && now < replyWindowEnd(start, holidays);
}

export function validateReopen(
  ticket: { status: TicketStatus; closedAt: Date | null; mergedIntoTicketId: string | null },
  holidays: Set<string>,
  now: Date = new Date(),
): { ok: boolean; error?: string } {
  if (ticket.status !== "CLOSED") {
    return { ok: false, error: `Only a CLOSED ticket can be reopened (current status: ${ticket.status})` };
  }
  if (ticket.mergedIntoTicketId) {
    return { ok: false, error: "This ticket was merged into another ticket -- work on that ticket instead" };
  }
  if (!withinReplyWindow(ticket.closedAt, holidays, now)) {
    return {
      ok: false,
      error: `Tickets can only be reopened within ${REPLY_WINDOW_WORKING_DAYS} working days of being closed`,
    };
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

/**
 * Where a ticket goes when the requester replies inside the window
 * (2026-10-06): like a staff reopen, except an assigned, categorised ticket
 * lands on RESPONSE_RECEIVED -- the requester did just respond -- so the
 * assignee gets the same alert as any other reply.
 */
export function replyReopenStatus(ticket: { assignedToId: string | null; categoryId: string | null }): TicketStatus {
  const status = reopenTargetStatus(ticket);
  return status === "IN_ACTION" ? "RESPONSE_RECEIVED" : status;
}

export type ReplyDecision =
  | { kind: "THREAD" } // open ticket: thread as before
  | { kind: "REOPEN"; toStatus: TicketStatus } // OUTCOME / CLOSED inside the window
  | { kind: "NEW_TICKET" }; // CLOSED past the window (or a close that never reopens)

/**
 * What an inbound reply does to the (not yet archived) ticket it threads
 * onto. A reply from the HR mailbox itself (our own sent copy) never reopens.
 */
export function replyDecision(
  ticket: {
    status: TicketStatus;
    closedAt: Date | null;
    closeReason: string | null;
    assignedToId: string | null;
    categoryId: string | null;
  },
  fromHrMailbox: boolean,
  holidays: Set<string>,
  now: Date = new Date(),
): ReplyDecision {
  if (ticket.status === "OUTCOME") {
    // The nightly job closes an OUTCOME ticket once its window ends, and the
    // CLOSED window follows straight on -- so until then a reply still reopens.
    return fromHrMailbox ? { kind: "THREAD" } : { kind: "REOPEN", toStatus: replyReopenStatus(ticket) };
  }
  if (ticket.status !== "CLOSED") return { kind: "THREAD" };
  // Info only / Autoclose are archived straight away -- a reply is a new matter.
  if (ticket.closeReason === "NOT_A_REQUEST" || ticket.closeReason === "AUTOCLOSE" || ticket.closeReason === "MERGED") {
    return { kind: "NEW_TICKET" };
  }
  if (!withinReplyWindow(ticket.closedAt, holidays, now)) return { kind: "NEW_TICKET" };
  return fromHrMailbox ? { kind: "THREAD" } : { kind: "REOPEN", toStatus: replyReopenStatus(ticket) };
}
