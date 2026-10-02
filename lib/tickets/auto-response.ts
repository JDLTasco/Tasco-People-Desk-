// Operator amendment (John, 2026-10-03): what an emailed reply threading
// onto a ticket does to it. Pure, so the rules are testable without a DB.
//
//  - Assigned and being worked (IN_ACTION, incl. an action item such as On
//    Hold, or AWAITING_RESPONSE): move to RESPONSE_RECEIVED + alert.
//  - Assigned but not yet started (ALLOCATED): alert only. RESPONSE_RECEIVED
//    isn't reachable from ALLOCATED (the §4 category guard), so the status
//    stays put.
//  - Already RESPONSE_RECEIVED: alert again, no status change.
//  - Unassigned, OUTCOME, CLOSED, or a copy from the HR mailbox itself: nothing.
export type AutoResponseDecision = "SET_RESPONSE_RECEIVED" | "ALERT_ONLY" | "NONE";

export function autoResponseReceivedFor(
  ticket: { status: string; assignedToId: string | null },
  fromAddress: string,
  hrMailboxAddress: string,
): AutoResponseDecision {
  if (!ticket.assignedToId) return "NONE";
  if (fromAddress.trim().toLowerCase() === hrMailboxAddress.toLowerCase()) return "NONE";
  if (ticket.status === "IN_ACTION" || ticket.status === "AWAITING_RESPONSE") return "SET_RESPONSE_RECEIVED";
  if (ticket.status === "ALLOCATED" || ticket.status === "RESPONSE_RECEIVED") return "ALERT_ONLY";
  return "NONE";
}
