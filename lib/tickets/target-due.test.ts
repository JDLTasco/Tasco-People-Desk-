import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  addWorkingDays,
  autoTargetDue,
  autoTargetReason,
  isAutoTargetReason,
  shouldRecalculateTarget,
} from "./target-due";

// 2026-10-05 is a Monday. 10:00 Melbourne (AEDT, UTC+11) = 23:00Z the day before.
const MON_10AM = new Date("2026-10-04T23:00:00Z");
const FRI_10AM = new Date("2026-10-08T23:00:00Z");
const SAT_10AM = new Date("2026-10-09T23:00:00Z");

describe("addWorkingDays", () => {
  it("Monday + 3 working days is Thursday, same time", () => {
    assert.equal(addWorkingDays(MON_10AM, 3).toISOString(), "2026-10-07T23:00:00.000Z");
  });

  it("skips the weekend: Friday + 3 is Wednesday", () => {
    assert.equal(addWorkingDays(FRI_10AM, 3).toISOString(), "2026-10-13T23:00:00.000Z");
  });

  it("a weekend arrival counts from Monday: Saturday + 3 is Wednesday", () => {
    assert.equal(addWorkingDays(SAT_10AM, 3).toISOString(), "2026-10-13T23:00:00.000Z");
  });

  it("10 working days is two calendar weeks", () => {
    assert.equal(addWorkingDays(MON_10AM, 10).toISOString(), "2026-10-18T23:00:00.000Z");
  });

  it("uses the Melbourne weekday, not UTC (Sat 9am Melbourne is Fri in UTC)", () => {
    const sat9amMelb = new Date("2026-10-09T22:00:00Z"); // Fri 22:00Z = Sat 09:00 AEDT
    assert.equal(addWorkingDays(sat9amMelb, 1).toISOString(), "2026-10-11T22:00:00.000Z"); // Mon 09:00
  });
});

describe("autoTargetDue", () => {
  it("P1 = 3, P2 = 10, P3 = 20 working days", () => {
    assert.equal(autoTargetDue(MON_10AM, "P1").targetDueAt.toISOString(), "2026-10-07T23:00:00.000Z");
    assert.equal(autoTargetDue(MON_10AM, "P2").targetDueAt.toISOString(), "2026-10-18T23:00:00.000Z");
    assert.equal(autoTargetDue(MON_10AM, "P3").targetDueAt.toISOString(), "2026-11-01T23:00:00.000Z");
  });

  it("records an automatic reason", () => {
    assert.equal(autoTargetDue(MON_10AM, "P2").targetDueReason, "Automatic: P2 = 10 working days");
  });
});

describe("shouldRecalculateTarget", () => {
  it("recalculates when there is no target yet, or it is automatic", () => {
    assert.equal(shouldRecalculateTarget({ targetDueAt: null, targetDueReason: null }), true);
    assert.equal(shouldRecalculateTarget({ targetDueAt: MON_10AM, targetDueReason: autoTargetReason("P3") }), true);
  });

  it("keeps a staff override", () => {
    assert.equal(shouldRecalculateTarget({ targetDueAt: MON_10AM, targetDueReason: "Fair Work deadline" }), false);
    assert.equal(isAutoTargetReason("Fair Work deadline"), false);
  });
});
