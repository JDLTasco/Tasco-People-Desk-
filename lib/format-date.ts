// Display-only date formatting -- Australian convention (DD/MM/YYYY),
// forced explicitly rather than relying on `.toLocaleString()`'s implicit
// locale, which on the server defaults to Node's own ICU locale (en-US,
// not en-AU) regardless of who's actually viewing the page, and on the
// client depends on each individual staff member's own browser/OS locale
// setting -- neither is guaranteed to read as DD/MM/YYYY for an
// Australian audience. Separate from lib/timezone.ts, which formats the
// Australia/Melbourne wall-clock date used to generate a ticket number
// (a stored value, not a display concern) -- do not conflate the two.
const DATE_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
};

export function formatAuDateTime(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleString("en-AU", DATE_TIME_OPTIONS);
}
