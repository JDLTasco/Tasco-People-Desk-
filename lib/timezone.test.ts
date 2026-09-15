import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { melbourneDateOnly, melbourneParts } from "./timezone";

describe("melbourneParts", () => {
  it("converts a UTC instant to Melbourne standard time (AEST, UTC+10) in June", () => {
    const parts = melbourneParts(new Date("2026-06-15T04:30:00Z"));
    assert.deepEqual(parts, { year: 2026, month: 6, day: 15, hour: 14, minute: 30 });
  });

  it("converts a UTC instant to Melbourne daylight time (AEDT, UTC+11) in January, rolling over to the next day", () => {
    const parts = melbourneParts(new Date("2026-01-15T14:00:00Z"));
    assert.deepEqual(parts, { year: 2026, month: 1, day: 16, hour: 1, minute: 0 });
  });
});

describe("melbourneDateOnly", () => {
  it("returns a UTC-midnight Date for the Melbourne calendar date", () => {
    const result = melbourneDateOnly(new Date("2026-01-15T14:00:00Z")); // Melbourne: Jan 16
    assert.equal(result.toISOString(), "2026-01-16T00:00:00.000Z");
  });

  it("a late-UTC-evening instant that is still the same Melbourne day stays that day", () => {
    // 2026-06-14T13:00:00Z -> Melbourne (UTC+10) = 2026-06-14 23:00, still June 14.
    const result = melbourneDateOnly(new Date("2026-06-14T13:00:00Z"));
    assert.equal(result.toISOString(), "2026-06-14T00:00:00.000Z");
  });
});
