import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  autoTargetDue,
  autoTargetReason,
  calculateTargetDueDate,
  isAutoTargetReason,
  missingTargetFields,
  shouldRecalculateTarget,
} from "./target-due";

// 2026-10-05 is a Monday. 10:00 Melbourne (AEDT, UTC+11) = 23:00Z the day before.
const MON_10AM = new Date("2026-10-04T23:00:00Z");
const FRI_10AM = new Date("2026-10-08T23:00:00Z");
const NONE = new Set<string>();
// Melbourne Cup Day 2026 (Tue 3 Nov) falls inside a P3 window from 5 Oct.
const WITH_CUP = new Set(["2026-11-03"]);

describe("calculateTargetDueDate / autoTargetDue", () => {
  it("P1 = 3, P2 = 10, P3 = 20 working days", () => {
    assert.equal(calculateTargetDueDate(MON_10AM, "P1", NONE).toISOString(), "2026-10-07T23:00:00.000Z");
    assert.equal(calculateTargetDueDate(MON_10AM, "P2", NONE).toISOString(), "2026-10-18T23:00:00.000Z");
    assert.equal(calculateTargetDueDate(MON_10AM, "P3", NONE).toISOString(), "2026-11-01T23:00:00.000Z");
  });

  it("a public holiday inside the window pushes the date out a working day", () => {
    // From Wed 28 Oct: P1 ends before Cup Day so is unaffected; P2 spans it and moves a day.
    const wed28Oct = new Date("2026-10-27T23:00:00Z"); // Wed 28 Oct 10:00 AEDT
    assert.equal(calculateTargetDueDate(wed28Oct, "P1", NONE).toISOString(), "2026-11-01T23:00:00.000Z"); // Mon 2 Nov
    assert.equal(calculateTargetDueDate(wed28Oct, "P1", WITH_CUP).toISOString(), "2026-11-01T23:00:00.000Z"); // Mon 2 Nov (Cup is after)
    assert.equal(calculateTargetDueDate(wed28Oct, "P2", NONE).toISOString(), "2026-11-10T23:00:00.000Z"); // Wed 11 Nov
    assert.equal(calculateTargetDueDate(wed28Oct, "P2", WITH_CUP).toISOString(), "2026-11-11T23:00:00.000Z"); // Thu 12 Nov
  });

  it("records an automatic reason", () => {
    assert.equal(autoTargetDue(MON_10AM, "P2", NONE).targetDueReason, "Automatic: P2 = 10 working days");
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

describe("missingTargetFields (2026-10-03 fix)", () => {
  it("fills an empty target from the current priority, even with no priority change", () => {
    const f = missingTargetFields({ receivedAt: MON_10AM, targetDueAt: null }, "P3", NONE);
    assert.equal(f.targetDueAt?.toISOString(), "2026-11-01T23:00:00.000Z");
    assert.equal(f.targetDueReason, "Automatic: P3 = 20 working days");
  });

  it("leaves an existing target alone (never silently rewritten)", () => {
    assert.deepEqual(missingTargetFields({ receivedAt: MON_10AM, targetDueAt: FRI_10AM }, "P1", WITH_CUP), {});
  });
});
