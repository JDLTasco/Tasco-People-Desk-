// Pure helpers for Admin -> Calendar (2026-10-03).

/** "YYYY-MM-DD" -> a UTC-midnight Date for a Postgres `date` column, or null if it isn't a real calendar date. */
export function parseCalendarDate(value: unknown): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) return null;
  return d;
}

export interface CalendarRow {
  id: string;
  date: string; // YYYY-MM-DD
  name: string;
  isRecurring: boolean;
}

/** Groups rows by year, then month name, in date order. Recurring dates are listed under "Every year". */
export function groupCalendar(rows: CalendarRow[]): { year: string; months: { month: string; days: CalendarRow[] }[] }[] {
  const monthName = (m: number) => new Date(Date.UTC(2000, m - 1, 1)).toLocaleString("en-AU", { month: "long", timeZone: "UTC" });
  const sorted = [...rows].sort((a, b) => (a.isRecurring === b.isRecurring ? a.date.localeCompare(b.date) : a.isRecurring ? -1 : 1));
  const years: { year: string; months: { month: string; days: CalendarRow[] }[] }[] = [];
  for (const r of sorted) {
    const year = r.isRecurring ? "Every year" : r.date.slice(0, 4);
    const month = monthName(Number(r.date.slice(5, 7)));
    let y = years.find((x) => x.year === year);
    if (!y) years.push((y = { year, months: [] }));
    let m = y.months.find((x) => x.month === month);
    if (!m) y.months.push((m = { month, days: [] }));
    m.days.push(r);
  }
  return years;
}
