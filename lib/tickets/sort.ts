// List ordering (John, 2026-09-29): in any list that mixes open and
// closed tickets, closed ones go to the bottom. Stable -- the query's own
// ordering is preserved within each group.

const FINISHED = new Set(["CLOSED", "ARCHIVED"]);

export function closedLast<T extends { status: string }>(rows: T[]): T[] {
  return [...rows.filter((r) => !FINISHED.has(r.status)), ...rows.filter((r) => FINISHED.has(r.status))];
}
