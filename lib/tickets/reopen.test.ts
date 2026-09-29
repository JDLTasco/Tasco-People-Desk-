import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { reopenTargetStatus, reopenWindowCutoff, validateReopen } from "./reopen";

const now = new Date("2026-09-29T00:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000);

describe("validateReopen", () => {
  it("allows a CLOSED ticket closed within 30 days", () => {
    assert.equal(validateReopen({ status: "CLOSED", closedAt: daysAgo(29), mergedIntoTicketId: null }, now).ok, true);
  });

  it("refuses once the 30-day window has passed", () => {
    assert.equal(validateReopen({ status: "CLOSED", closedAt: daysAgo(31), mergedIntoTicketId: null }, now).ok, false);
  });

  it("refuses a ticket with no closure date", () => {
    assert.equal(validateReopen({ status: "CLOSED", closedAt: null, mergedIntoTicketId: null }, now).ok, false);
  });

  it("refuses non-CLOSED statuses, including ARCHIVED", () => {
    for (const status of ["ARCHIVED", "IN_ACTION", "NEW"] as const) {
      assert.equal(validateReopen({ status, closedAt: daysAgo(1), mergedIntoTicketId: null }, now).ok, false);
    }
  });

  it("refuses a ticket that was merged away", () => {
    assert.equal(validateReopen({ status: "CLOSED", closedAt: daysAgo(1), mergedIntoTicketId: "x" }, now).ok, false);
  });
});

describe("reopenWindowCutoff", () => {
  it("is exactly 30 days before now", () => {
    assert.equal(reopenWindowCutoff(now).toISOString(), daysAgo(30).toISOString());
  });
});

describe("reopenTargetStatus", () => {
  it("goes back to IN_ACTION with its assignee when it has a category", () => {
    assert.equal(reopenTargetStatus({ assignedToId: "u", categoryId: "c" }), "IN_ACTION");
  });
  it("goes to ALLOCATED when assigned but uncategorised", () => {
    assert.equal(reopenTargetStatus({ assignedToId: "u", categoryId: null }), "ALLOCATED");
  });
  it("goes back to the Pool as NEW when never assigned", () => {
    assert.equal(reopenTargetStatus({ assignedToId: null, categoryId: "c" }), "NEW");
  });
});
