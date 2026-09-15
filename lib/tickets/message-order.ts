// A ticket_messages row's chronological timestamp lives in one of two
// columns depending on direction -- received_at for inbound email, sent_at
// for outbound (Allocation/Outcome/SLA escalation never populate
// received_at). Previously only lib/archive/render.ts got this right;
// lib/tickets/detail.ts's live ticket-detail query sorted by received_at
// alone, which pushed every outbound message to the very end of the
// thread (Postgres sorts NULLS LAST) regardless of when it actually sent --
// found and fixed 2026-09-16 after an outbound email appeared to be
// "missing" from a ticket with later inbound replies.
export function messageTimestamp(m: { direction: string; receivedAt: Date | null; sentAt: Date | null }): Date {
  return (m.direction === "INBOUND" ? m.receivedAt : m.sentAt) ?? new Date(0);
}

export function sortMessagesChronologically<T extends { direction: string; receivedAt: Date | null; sentAt: Date | null }>(
  messages: T[],
): T[] {
  return [...messages].sort((a, b) => messageTimestamp(a).getTime() - messageTimestamp(b).getTime());
}
