import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { replyDecision, replyReopenStatus, replyWindowEnd, reopenTargetStatus, validateReopen, withinReplyWindow } from "./reopen";

const NONE = new Set<string>();
// Thursday 8 Oct 2026, 15:00 Melbourne (AEDT, UTC+11).
const THU_3PM = new Date("2026-10-08T04:00:00Z");
// Two working days later: Monday 12 Oct, 15:00 Melbourne.
const MON_3PM = new Date("2026-10-12T04:00:00Z");
const justBefore = new Date(MON_3PM.getTime() - 60_000);

describe("replyWindowEnd (2 working days)", () => {
  it("Thursday 3pm -> Monday 3pm, skipping the weekend", () => {
    assert.equal(replyWindowEnd(THU_3PM, NONE).toISOString(), MON_3PM.toISOString());
  });
  it("a non-working day on Admin -> Calendar pushes it a day further", () => {
    assert.equal(replyWindowEnd(THU_3PM, new Set(["2026-10-09"])).toISOString(), "2026-10-13T04:00:00.000Z");
  });
  it("withinReplyWindow is true right up to the end, false from then on", () => {
    assert.equal(withinReplyWindow(THU_3PM, NONE, justBefore), true);
    assert.equal(withinReplyWindow(THU_3PM, NONE, MON_3PM), false);
    assert.equal(withinReplyWindow(null, NONE, justBefore), false);
  });
});

describe("validateReopen", () => {
  const closed = { status: "CLOSED" as const, closedAt: THU_3PM, mergedIntoTicketId: null };
  it("allows a CLOSED ticket inside its 2 working-day window", () => {
    assert.equal(validateReopen(closed, NONE, justBefore).ok, true);
  });
  it("refuses once the window has passed", () => {
    assert.equal(validateReopen(closed, NONE, MON_3PM).ok, false);
  });
  it("refuses a ticket with no closure date", () => {
    assert.equal(validateReopen({ ...closed, closedAt: null }, NONE, justBefore).ok, false);
  });
  it("refuses non-CLOSED statuses, including ARCHIVED", () => {
    for (const status of ["ARCHIVED", "IN_ACTION", "NEW"] as const) {
      assert.equal(validateReopen({ ...closed, status }, NONE, justBefore).ok, false);
    }
  });
  it("refuses a ticket that was merged away", () => {
    assert.equal(validateReopen({ ...closed, mergedIntoTicketId: "x" }, NONE, justBefore).ok, false);
  });
});

describe("reopenTargetStatus / replyReopenStatus", () => {
  it("staff reopen goes back to IN_ACTION with its assignee when it has a category", () => {
    assert.equal(reopenTargetStatus({ assignedToId: "u", categoryId: "c" }), "IN_ACTION");
  });
  it("goes to ALLOCATED when assigned but uncategorised", () => {
    assert.equal(reopenTargetStatus({ assignedToId: "u", categoryId: null }), "ALLOCATED");
  });
  it("goes back to the Pool as NEW when never assigned", () => {
    assert.equal(reopenTargetStatus({ assignedToId: null, categoryId: "c" }), "NEW");
  });
  it("a requester reply lands on RESPONSE_RECEIVED instead of IN_ACTION", () => {
    assert.equal(replyReopenStatus({ assignedToId: "u", categoryId: "c" }), "RESPONSE_RECEIVED");
    assert.equal(replyReopenStatus({ assignedToId: "u", categoryId: null }), "ALLOCATED");
    assert.equal(replyReopenStatus({ assignedToId: null, categoryId: "c" }), "NEW");
  });
});

describe("replyDecision (2026-10-06)", () => {
  const base = { closedAt: THU_3PM, closeReason: "RESOLVED", assignedToId: "u", categoryId: "c" };
  it("open tickets just thread", () => {
    for (const status of ["NEW", "ALLOCATED", "IN_ACTION", "AWAITING_RESPONSE", "RESPONSE_RECEIVED"] as const) {
      assert.deepEqual(replyDecision({ ...base, status, closedAt: null, closeReason: null }, false, NONE, justBefore), { kind: "THREAD" });
    }
  });
  it("a reply to an OUTCOME ticket reopens it to RESPONSE_RECEIVED", () => {
    const t = { ...base, status: "OUTCOME" as const, closedAt: null, closeReason: null };
    assert.deepEqual(replyDecision(t, false, NONE, MON_3PM), { kind: "REOPEN", toStatus: "RESPONSE_RECEIVED" });
  });
  it("a reply to a CLOSED ticket inside the window reopens it", () => {
    assert.deepEqual(replyDecision({ ...base, status: "CLOSED" }, false, NONE, justBefore), {
      kind: "REOPEN",
      toStatus: "RESPONSE_RECEIVED",
    });
  });
  it("a reply after the window starts a new ticket", () => {
    assert.deepEqual(replyDecision({ ...base, status: "CLOSED" }, false, NONE, MON_3PM), { kind: "NEW_TICKET" });
  });
  it("Info only / Autoclose / merged-away closes never reopen", () => {
    for (const closeReason of ["NOT_A_REQUEST", "AUTOCLOSE", "MERGED"]) {
      assert.deepEqual(replyDecision({ ...base, status: "CLOSED", closeReason }, false, NONE, justBefore), { kind: "NEW_TICKET" });
    }
  });
  it("a copy from the HR mailbox itself threads without reopening", () => {
    assert.deepEqual(replyDecision({ ...base, status: "CLOSED" }, true, NONE, justBefore), { kind: "THREAD" });
    assert.deepEqual(replyDecision({ ...base, status: "OUTCOME", closedAt: null, closeReason: null }, true, NONE, justBefore), {
      kind: "THREAD",
    });
  });
});
