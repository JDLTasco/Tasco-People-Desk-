// §7.3, amended by operator request (2026-09-16, not in the original
// v1.3 text -- see STATUS.md): subject contains "urgent" (case-
// insensitive) -> P1, with a 2-day SLA (lib/tickets/sla.ts). Everything
// else defaults to P3 provisionally -- priority for a non-urgent ticket
// is deliberately left for the officer who allocates it to set (or
// confirm) explicitly, not guessed from subject keywords. The old
// "'action' -> P2" auto-classification rule is removed; amending
// priority after creation (PATCH /api/tickets/[id]) recalculates
// sla_due_at from lib/tickets/sla.ts.
export type Priority = "P1" | "P2" | "P3";

export function classifyPriority(subject: string): Priority {
  const lower = subject.toLowerCase();
  if (lower.includes("urgent")) return "P1";
  return "P3";
}
