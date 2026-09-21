// Display-only date formatting -- Australian convention (DD/MM/YYYY,
// Australia/Melbourne wall-clock time), forced explicitly on both counts
// rather than relying on `.toLocaleString()`'s implicit locale/timezone.
// Locale alone (en-AU) only fixes the digit ORDER -- with no explicit
// `timeZone`, `Intl` still converts to whatever timezone the runtime
// itself is in, which on Azure App Service is UTC, not Melbourne (found
// live 2026-09-21: a 16:10 AEST legal-hold timestamp rendered as "06:10
// am" -- correct date order, wrong clock time entirely, a 10-hour-off
// bug that would have gone unnoticed indefinitely against a browser's own
// local-seeming default). `timeZone: "Australia/Melbourne"` (an IANA
// zone, same as lib/timezone.ts uses) handles AEST/AEDT DST transitions
// automatically, which a fixed UTC+10/+11 offset would not. Separate from
// lib/timezone.ts, which formats the Australia/Melbourne wall-clock date
// used to generate a ticket number (a stored value, not a display
// concern) -- do not conflate the two.
const DATE_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  timeZone: "Australia/Melbourne",
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
