import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { displayStatus, validateActionStatusChange, type ActionStatusChangeContext } from "./action-status";

const officer: ActionStatusChangeContext = {
  status: "IN_ACTION",
  currentActionStatusId: null,
  targetActionStatusId: "on-hold",
  actorRole: "HR_OFFICER",
  isAssignee: false,
  categoryId: "cat",
};

describe("validateActionStatusChange", () => {
  it("lets any staff member set an action item on an IN_ACTION ticket", () => {
    assert.equal(validateActionStatusChange(officer).ok, true);
  });

  it("lets any staff member switch between action items", () => {
    assert.equal(validateActionStatusChange({ ...officer, currentActionStatusId: "other" }).ok, true);
  });

  it("refuses setting the same item again", () => {
    assert.equal(validateActionStatusChange({ ...officer, currentActionStatusId: "on-hold" }).ok, false);
  });

  it("refuses outside the working statuses", () => {
    for (const status of ["NEW", "ALLOCATED", "OUTCOME", "CLOSED", "ARCHIVED"] as const) {
      const result = validateActionStatusChange({ ...officer, status });
      assert.equal(result.ok, false);
      assert.equal(result.status, 400);
    }
  });

  it("from a response sub-step, only the assignee/HR_LEAD/ADMIN may set one (it moves the ticket back to IN_ACTION)", () => {
    for (const status of ["AWAITING_RESPONSE", "RESPONSE_RECEIVED"] as const) {
      assert.equal(validateActionStatusChange({ ...officer, status }).status, 403);
      assert.equal(validateActionStatusChange({ ...officer, status, isAssignee: true }).ok, true);
      assert.equal(validateActionStatusChange({ ...officer, status, actorRole: "HR_LEAD" }).ok, true);
    }
  });

  it("clearing is assignee/HR_LEAD/ADMIN only", () => {
    const clear = { ...officer, currentActionStatusId: "on-hold", targetActionStatusId: null };
    assert.equal(validateActionStatusChange(clear).status, 403);
    assert.equal(validateActionStatusChange({ ...clear, isAssignee: true }).ok, true);
    assert.equal(validateActionStatusChange({ ...clear, actorRole: "ADMIN" }).ok, true);
  });

  it("refuses clearing when there is nothing to clear", () => {
    assert.equal(validateActionStatusChange({ ...officer, targetActionStatusId: null, isAssignee: true }).status, 400);
  });
});

describe("displayStatus", () => {
  it("shows the action item's name while IN_ACTION", () => {
    assert.equal(displayStatus({ status: "IN_ACTION", actionStatus: { name: "On Hold" } }), "On Hold");
  });

  it("shows the plain status otherwise", () => {
    assert.equal(displayStatus({ status: "IN_ACTION", actionStatus: null }), "IN_ACTION");
    assert.equal(displayStatus({ status: "OUTCOME", actionStatus: { name: "On Hold" } }), "OUTCOME");
  });
});
