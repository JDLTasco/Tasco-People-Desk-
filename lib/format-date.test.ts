import { test } from "node:test";
import assert from "node:assert/strict";
import { formatAuDateTime } from "./format-date";

test("formatAuDateTime renders DD/MM/YYYY, not the US MM/DD/YYYY default", () => {
  // 2026-09-21 -- day (21) is unambiguous: only valid as DD/MM, never MM/DD.
  const result = formatAuDateTime(new Date("2026-09-21T04:30:00Z"));
  assert.match(result, /^21\/09\/2026, \d{1,2}:\d{2} (am|pm)$/);
});

test("formatAuDateTime converts to Australia/Melbourne wall-clock time, not the runtime's own timezone", () => {
  // Found live 2026-09-21: a real 16:10 AEST timestamp rendered as "06:10
  // am" because the helper set the locale (date order) but never the
  // timeZone, so Intl silently used the server's own timezone (UTC on
  // Azure App Service) instead of converting to Melbourne. 04:30 UTC on
  // this date is AEST (UTC+10, before October's DST changeover) -> 14:30
  // local -- asserting the exact wall-clock hour, not just the date, is
  // what would have caught this the first time.
  const result = formatAuDateTime(new Date("2026-09-21T04:30:00Z"));
  assert.equal(result, "21/09/2026, 02:30 pm");
});

test("formatAuDateTime accepts an ISO string the same as a Date", () => {
  const fromString = formatAuDateTime("2026-01-05T14:30:00Z");
  const fromDate = formatAuDateTime(new Date("2026-01-05T14:30:00Z"));
  assert.equal(fromString, fromDate);
});
