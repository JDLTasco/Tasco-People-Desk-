import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { breachedDeadline, effectiveDueDate, isOverdue } from "./due-dates";

const SLA = new Date("2026-06-10T00:00:00Z");
const EARLIER_TARGET = new Date("2026-06-05T00:00:00Z");
const LATER_TARGET = new Date("2026-06-20T00:00:00Z");

describe("effectiveDueDate", () => {
  it("is sla_due_at when there is no target due date", () => {
    assert.equal(effectiveDueDate(SLA, null).getTime(), SLA.getTime());
  });

  it("is the target due date when it is earlier than the SLA (can only bring it forward)", () => {
    assert.equal(effectiveDueDate(SLA, EARLIER_TARGET).getTime(), EARLIER_TARGET.getTime());
  });

  it("is still the SLA date when the target due date is LATER (cannot extend the SLA floor)", () => {
    assert.equal(effectiveDueDate(SLA, LATER_TARGET).getTime(), SLA.getTime());
  });
});

describe("isOverdue", () => {
  const now = new Date("2026-06-15T00:00:00Z");

  it("a ticket with an earlier target due date is overdue on the target date, not the (later) SLA date", () => {
    assert.equal(isOverdue(SLA, EARLIER_TARGET, "IN_ACTION", now), true);
  });

  it("a ticket with a later target due date is still overdue on the SLA date", () => {
    // now (Jun 15) is after SLA (Jun 10) but before the later target (Jun 20)
    assert.equal(isOverdue(SLA, LATER_TARGET, "IN_ACTION", now), true);
  });

  it("not overdue before either deadline", () => {
    const early = new Date("2026-06-01T00:00:00Z");
    assert.equal(isOverdue(SLA, LATER_TARGET, "IN_ACTION", early), false);
  });

  it("never overdue once CLOSED or ARCHIVED, regardless of dates", () => {
    const wayPast = new Date("2027-01-01T00:00:00Z");
    assert.equal(isOverdue(SLA, null, "CLOSED", wayPast), false);
    assert.equal(isOverdue(SLA, null, "ARCHIVED", wayPast), false);
  });
});

describe("breachedDeadline", () => {
  it("names TARGET when the target due date is the earlier (effective) one", () => {
    assert.equal(breachedDeadline(SLA, EARLIER_TARGET), "TARGET");
  });

  it("names SLA when there is no target due date, or the target is later", () => {
    assert.equal(breachedDeadline(SLA, null), "SLA");
    assert.equal(breachedDeadline(SLA, LATER_TARGET), "SLA");
  });
});
