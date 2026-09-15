// Operator addition (not in v1.3 spec): §7.3 step 3's primary threading
// mechanism (lib/ingestion/process-message.ts) matches on conversation_id,
// which only survives when a reply carries the original message's
// threading headers. This is a fallback -- if the subject still has the
// ticket number every outbound email puts there
// (lib/email/templates.ts's "[TICKETNO] ..."), a fresh email, a forward,
// or a client that drops threading headers can still land on the right
// ticket. Operator decision, asked directly rather than guessed: matches
// on subject alone, no sender/requester check -- see STATUS.md.
const TICKET_NO_PATTERN = /\[(\d{12})\]/;

export function extractTicketNoFromSubject(subject: string): string | null {
  const match = subject.match(TICKET_NO_PATTERN);
  return match ? match[1] : null;
}
