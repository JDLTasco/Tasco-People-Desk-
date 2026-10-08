// Termination date on Terminations/Resignations tickets (John, 2026-10-08):
// a plain calendar date (tickets.termination_date, DATE), shown on the
// ticket page for that category and listed on the dashboard's Upcoming
// Terminations.

/** The Terminations/Resignations category, matched by name so a small rename doesn't lose it. */
export function isTerminationCategoryName(name: string | null | undefined): boolean {
  return !!name && /terminat|resign/i.test(name);
}

/** The words a category name is matched on in database queries (any of them, case-insensitive). */
export const TERMINATION_CATEGORY_WORDS = ["terminat", "resign"] as const;

/**
 * "YYYY-MM-DD" -> that date at midnight UTC (how Prisma stores a DATE);
 * null -> null (cleared); anything else -> undefined (invalid).
 */
export function parseTerminationDate(value: unknown): Date | null | undefined {
  if (value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value ? undefined : d;
}

/** A stored DATE back to "YYYY-MM-DD" (for date inputs), or "" when not set. */
export function terminationDateKey(d: Date | null | undefined): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

/** "Fri 24/10/2026" for display. */
export function formatTerminationDate(key: string): string {
  return new Date(`${key}T00:00:00Z`).toLocaleDateString("en-AU", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}
