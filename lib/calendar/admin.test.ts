import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { groupCalendar, parseCalendarDate } from "./admin";

describe("parseCalendarDate", () => {
  it("accepts a real date and rejects junk or impossible dates", () => {
    assert.equal(parseCalendarDate("2026-12-28")?.toISOString(), "2026-12-28T00:00:00.000Z");
    assert.equal(parseCalendarDate("2026-02-30"), null);
    assert.equal(parseCalendarDate("28/12/2026"), null);
    assert.equal(parseCalendarDate(undefined), null);
  });
});

describe("groupCalendar", () => {
  it("groups by year then month, recurring dates first under Every year", () => {
    const out = groupCalendar([
      { id: "c", date: "2027-01-01", name: "New Year", isRecurring: false },
      { id: "a", date: "2026-12-25", name: "Christmas", isRecurring: false },
      { id: "b", date: "2026-12-28", name: "Boxing (add.)", isRecurring: false },
      { id: "r", date: "2026-12-24", name: "Shutdown", isRecurring: true },
    ]);
    assert.deepEqual(out.map((y) => y.year), ["Every year", "2026", "2027"]);
    assert.deepEqual(out[1].months.map((m) => [m.month, m.days.map((d) => d.id)]), [["December", ["a", "b"]]]);
  });
});
