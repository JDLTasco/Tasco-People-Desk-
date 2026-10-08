import { test } from "node:test";
import assert from "node:assert/strict";
import { isTerminationCategoryName, parseTerminationDate, terminationDateKey } from "./terminations";

test("matches the Terminations/Resignations category by name", () => {
  assert.equal(isTerminationCategoryName("Terminations/Resignations"), true);
  assert.equal(isTerminationCategoryName("resignations"), true);
  assert.equal(isTerminationCategoryName("Payroll"), false);
  assert.equal(isTerminationCategoryName(null), false);
});

test("parses a calendar date, clears on null/empty, refuses anything else", () => {
  assert.equal(parseTerminationDate("2026-10-24")?.toISOString(), "2026-10-24T00:00:00.000Z");
  assert.equal(parseTerminationDate(null), null);
  assert.equal(parseTerminationDate(""), null);
  assert.equal(parseTerminationDate("2026-02-30"), undefined);
  assert.equal(parseTerminationDate("24/10/2026"), undefined);
  assert.equal(parseTerminationDate("2026-10-24T10:00"), undefined);
  assert.equal(parseTerminationDate(20261024), undefined);
});

test("round-trips to the date input's value", () => {
  assert.equal(terminationDateKey(parseTerminationDate("2027-01-05")), "2027-01-05");
  assert.equal(terminationDateKey(null), "");
});
