import { test } from "node:test";
import assert from "node:assert/strict";
import { formatAuDateTime } from "./format-date";

test("formatAuDateTime renders DD/MM/YYYY, not the US MM/DD/YYYY default", () => {
  // 2026-09-21 -- day (21) is unambiguous: only valid as DD/MM, never MM/DD.
  const result = formatAuDateTime(new Date("2026-09-21T04:30:00Z"));
  assert.match(result, /^21\/09\/2026, \d{1,2}:\d{2} (am|pm)$/);
});

test("formatAuDateTime accepts an ISO string the same as a Date", () => {
  const fromString = formatAuDateTime("2026-01-05T14:30:00Z");
  const fromDate = formatAuDateTime(new Date("2026-01-05T14:30:00Z"));
  assert.equal(fromString, fromDate);
});
