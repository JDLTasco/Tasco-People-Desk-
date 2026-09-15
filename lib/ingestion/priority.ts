// §7.3: "subject contains 'urgent' (case-insensitive) -> P1; contains
// 'action' -> P2; otherwise P3." Checked in that order -- a subject
// containing both is P1, per the table's own top-to-bottom precedence.
export type Priority = "P1" | "P2" | "P3";

export function classifyPriority(subject: string): Priority {
  const lower = subject.toLowerCase();
  if (lower.includes("urgent")) return "P1";
  if (lower.includes("action")) return "P2";
  return "P3";
}
