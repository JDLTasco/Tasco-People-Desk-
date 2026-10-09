import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assignmentDueAt, assignmentKpiResult, isAssignmentOverdue } from "./assignment-kpi";
import { melbourneWallTimeToUtc } from "../timezone";

const NONE = new Set<string>();
const melb = (y: number, m: number, d: number, h = 10, min = 0) => melbourneWallTimeToUtc(y, m, d, h, min);

describe("assignmentDueAt", () => {
  it("weekday arrival is due the same time next working day", () => {
    assert.equal(assignmentDueAt(melb(2026, 10, 13, 9, 30), NONE).getTime(), melb(2026, 10, 14, 9, 30).getTime()); // Tue -> Wed
    assert.equal(assignmentDueAt(melb(2026, 10, 16, 15), NONE).getTime(), melb(2026, 10, 19, 15).getTime()); // Fri -> Mon
  });

  it("a public holiday pushes it a day further", () => {
    // Thu 24 Dec 2026, Christmas Fri, Boxing Day holiday Mon 28th -> Tue 29th
    const holidays = new Set(["2026-12-25", "2026-12-26", "2026-12-28"]);
    assert.equal(assignmentDueAt(melb(2026, 12, 24, 11), holidays).getTime(), melb(2026, 12, 29, 11).getTime());
  });

  it("weekend arrival is due by the end of the next working day", () => {
    assert.equal(assignmentDueAt(melb(2026, 10, 17, 10), NONE).getTime(), melb(2026, 10, 20, 0).getTime()); // Sat -> end of Mon
    assert.equal(assignmentDueAt(melb(2026, 10, 18, 23), NONE).getTime(), melb(2026, 10, 20, 0).getTime()); // Sun -> end of Mon
  });
});

describe("assignment KPI result", () => {
  const received = melb(2026, 10, 13, 9); // Tue 9am, due Wed 9am
  it("assigned in time = met, late = missed", () => {
    assert.equal(assignmentKpiResult({ status: "ALLOCATED", receivedAt: received, assignedAt: melb(2026, 10, 14, 8) }, melb(2026, 10, 20), NONE), "met");
    assert.equal(assignmentKpiResult({ status: "IN_ACTION", receivedAt: received, assignedAt: melb(2026, 10, 14, 10) }, melb(2026, 10, 20), NONE), "missed");
  });

  it("still in the Pool: not counted until due, then missed and overdue", () => {
    const t = { status: "NEW", receivedAt: received, assignedAt: null, assignedToId: null };
    assert.equal(assignmentKpiResult(t, melb(2026, 10, 14, 8), NONE), null);
    assert.equal(isAssignmentOverdue(t, melb(2026, 10, 14, 8), NONE), false);
    assert.equal(assignmentKpiResult(t, melb(2026, 10, 14, 10), NONE), "missed");
    assert.equal(isAssignmentOverdue(t, melb(2026, 10, 14, 10), NONE), true);
  });

  it("closed straight from the Pool without assignment doesn't count", () => {
    assert.equal(assignmentKpiResult({ status: "CLOSED", receivedAt: received, assignedAt: null }, melb(2026, 10, 20), NONE), null);
    assert.equal(isAssignmentOverdue({ status: "CLOSED", receivedAt: received, assignedAt: null }, melb(2026, 10, 20), NONE), false);
  });
});
