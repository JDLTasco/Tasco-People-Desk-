import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  addCalendarDaysMelbourne,
  addWorkingDays,
  buildHolidaySet,
  holidayKey,
  isWorkingDay,
  melbourneDateKey,
  workingDaysBetween,
} from "./working-days";
import { melbourneWallTimeToUtc } from "../timezone";

const NONE = new Set<string>();
// Victorian public holidays used in these tests (the real 2026/27 dates).
const VIC = new Set([
  "2026-04-03", // Good Friday
  "2026-04-04", // Easter Saturday
  "2026-04-05", // Easter Sunday
  "2026-04-06", // Easter Monday
  "2026-12-25", // Christmas Day (Fri)
  "2026-12-26", // Boxing Day (Sat)
  "2026-12-28", // Boxing Day holiday (Mon)
  "2027-01-01", // New Year's Day (Fri)
]);
const melb = (y: number, m: number, d: number, h = 10, min = 0) => melbourneWallTimeToUtc(y, m, d, h, min);
const key = (d: Date) => melbourneDateKey(d);

describe("melbourneWallTimeToUtc", () => {
  it("handles standard and daylight time", () => {
    assert.equal(melb(2026, 6, 15, 14, 30).toISOString(), "2026-06-15T04:30:00.000Z"); // AEST +10
    assert.equal(melb(2026, 1, 16, 1, 0).toISOString(), "2026-01-15T14:00:00.000Z"); // AEDT +11
  });
});

describe("isWorkingDay", () => {
  it("weekdays are working days, weekends are not", () => {
    assert.equal(isWorkingDay(melb(2026, 10, 5), NONE), true); // Monday
    assert.equal(isWorkingDay(melb(2026, 10, 10), NONE), false); // Saturday
    assert.equal(isWorkingDay(melb(2026, 10, 11), NONE), false); // Sunday
  });

  it("a listed holiday on a weekday is not a working day", () => {
    assert.equal(isWorkingDay(melb(2026, 4, 3), VIC), false); // Good Friday
  });

  it("uses the Melbourne date, not UTC (Sat 9am Melbourne is still Friday in UTC)", () => {
    assert.equal(isWorkingDay(new Date("2026-10-09T22:00:00Z"), NONE), false);
  });

  it("recurring dates apply every year", () => {
    const set = buildHolidaySet([{ date: new Date("2026-12-24T00:00:00Z"), isRecurring: true }]);
    assert.equal(holidayKey(new Date("2026-12-24T00:00:00Z"), true), "*-12-24");
    assert.equal(isWorkingDay(melb(2027, 12, 24), set), false); // Fri 24 Dec 2027
    assert.equal(isWorkingDay(melb(2027, 12, 23), set), true);
  });
});

describe("addWorkingDays", () => {
  it("ordinary week: Monday + 3 is Thursday, same time", () => {
    assert.equal(addWorkingDays(melb(2026, 10, 5), 3, NONE).toISOString(), melb(2026, 10, 8).toISOString());
  });

  it("weekend start: Saturday + 3 is Wednesday; Friday + 3 is Wednesday", () => {
    assert.equal(key(addWorkingDays(melb(2026, 10, 10), 3, NONE)), "2026-10-14");
    assert.equal(key(addWorkingDays(melb(2026, 10, 9), 3, NONE)), "2026-10-14");
  });

  it("Easter long weekend: Thursday 2 April + 1 is Tuesday 7 April", () => {
    assert.equal(key(addWorkingDays(melb(2026, 4, 2), 1, VIC)), "2026-04-07");
  });

  it("Easter: P1 (3 working days) from Wed 1 April lands on Wed 8 April", () => {
    assert.equal(key(addWorkingDays(melb(2026, 4, 1), 3, VIC)), "2026-04-08");
  });

  it("Christmas/New Year: Thu 24 Dec 2026 + 3 is Thu 31 Dec; Thu 31 Dec + 1 is Mon 4 Jan", () => {
    // 25 (hol), 26 Sat, 27 Sun, 28 (hol), 29 Tue = 1, 30 Wed = 2, 31 Thu = 3
    assert.equal(key(addWorkingDays(melb(2026, 12, 24), 3, VIC)), "2026-12-31");
    // 1 Jan 2027 is a holiday too: Thu 31 Dec + 1 is Mon 4 Jan
    assert.equal(key(addWorkingDays(melb(2026, 12, 31), 1, VIC)), "2027-01-04");
  });

  it("keeps the Melbourne wall-clock time across the daylight-saving change (4 Oct 2026)", () => {
    const fri = melb(2026, 10, 2, 9, 15); // AEST
    const result = addWorkingDays(fri, 1, NONE); // Mon 5 Oct, AEDT
    assert.equal(result.toISOString(), melb(2026, 10, 5, 9, 15).toISOString());
    assert.equal(result.toISOString(), "2026-10-04T22:15:00.000Z");
  });
});

describe("addCalendarDaysMelbourne", () => {
  it("rolls over month and year ends", () => {
    assert.equal(key(addCalendarDaysMelbourne(melb(2026, 12, 31), 1)), "2027-01-01");
  });
});

describe("workingDaysBetween", () => {
  it("counts working days after the start up to and including the end", () => {
    assert.equal(workingDaysBetween(melb(2026, 10, 5), melb(2026, 10, 12), NONE), 5); // Mon -> next Mon
    assert.equal(workingDaysBetween(melb(2026, 4, 2), melb(2026, 4, 7), VIC), 1); // Easter
    assert.equal(workingDaysBetween(melb(2026, 10, 5), melb(2026, 10, 5), NONE), 0);
  });
});
