import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  validateNotARequestClose,
  validateReassignment,
  validateReversal,
  validateTransition,
} from "./transitions";

const baseCtx = { actorRole: "HR_OFFICER" as const, isAssignee: true, categoryId: "cat-1" };

describe("validateTransition: NEW -> ALLOCATED", () => {
  it("always allowed, no guard", () => {
    assert.equal(validateTransition("NEW", "ALLOCATED", baseCtx).ok, true);
    assert.equal(
      validateTransition("NEW", "ALLOCATED", { ...baseCtx, isAssignee: false, categoryId: null }).ok,
      true,
    );
  });
});

describe("validateTransition: ALLOCATED -> IN_ACTION (the category guard)", () => {
  it("succeeds with a category and no business unit", () => {
    assert.equal(validateTransition("ALLOCATED", "IN_ACTION", baseCtx).ok, true);
  });

  it("fails with HTTP 400 naming the missing field when category is null", () => {
    const result = validateTransition("ALLOCATED", "IN_ACTION", { ...baseCtx, categoryId: null });
    assert.equal(result.ok, false);
    assert.equal(result.status, 400);
    assert.match(result.error!, /category_id/);
  });

  it("HR_OFFICER may only start action on their own assigned ticket", () => {
    const notAssignee = { ...baseCtx, isAssignee: false };
    const result = validateTransition("ALLOCATED", "IN_ACTION", notAssignee);
    assert.equal(result.ok, false);
    assert.equal(result.status, 403);
  });

  it("HR_LEAD and ADMIN may start action regardless of assignment", () => {
    assert.equal(
      validateTransition("ALLOCATED", "IN_ACTION", { ...baseCtx, actorRole: "HR_LEAD", isAssignee: false }).ok,
      true,
    );
    assert.equal(
      validateTransition("ALLOCATED", "IN_ACTION", { ...baseCtx, actorRole: "ADMIN", isAssignee: false }).ok,
      true,
    );
  });
});

describe("validateTransition: IN_ACTION -> OUTCOME (dispatch-preview-only)", () => {
  it("fails via the generic API even with permission, when not via dispatch preview", () => {
    const result = validateTransition("IN_ACTION", "OUTCOME", baseCtx);
    assert.equal(result.ok, false);
    assert.equal(result.status, 400);
    assert.match(result.error!, /dispatch preview/);
  });

  it("succeeds only when viaDispatchPreview is explicitly set (Stage 5's own endpoint)", () => {
    assert.equal(validateTransition("IN_ACTION", "OUTCOME", { ...baseCtx, viaDispatchPreview: true }).ok, true);
  });

  it("still requires assignee/HR_LEAD/ADMIN even via dispatch preview", () => {
    const result = validateTransition("IN_ACTION", "OUTCOME", {
      ...baseCtx,
      isAssignee: false,
      viaDispatchPreview: true,
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, 403);
  });
});

describe("validateTransition: OUTCOME -> CLOSED", () => {
  it("succeeds for assignee/HR_LEAD/ADMIN, no other guard", () => {
    assert.equal(validateTransition("OUTCOME", "CLOSED", baseCtx).ok, true);
  });

  it("fails for a non-assignee HR_OFFICER", () => {
    assert.equal(validateTransition("OUTCOME", "CLOSED", { ...baseCtx, isAssignee: false }).ok, false);
  });
});

describe("validateTransition: CLOSED -> ARCHIVED (automated job only)", () => {
  it("fails for any user-initiated request", () => {
    const result = validateTransition("CLOSED", "ARCHIVED", baseCtx);
    assert.equal(result.ok, false);
    assert.equal(result.status, 400);
  });

  it("succeeds only when isAutomatedArchiveJob is set", () => {
    assert.equal(validateTransition("CLOSED", "ARCHIVED", { ...baseCtx, isAutomatedArchiveJob: true }).ok, true);
  });
});

describe("validateTransition: anything not in the §4 table", () => {
  it("rejects NEW -> CLOSED directly with HTTP 400", () => {
    const result = validateTransition("NEW", "CLOSED", baseCtx);
    assert.equal(result.ok, false);
    assert.equal(result.status, 400);
  });

  it("rejects ARCHIVED -> anything (forward)", () => {
    assert.equal(validateTransition("ARCHIVED", "CLOSED", baseCtx).ok, false);
  });
});

describe('validateNotARequestClose ("not a request" close)', () => {
  it("allowed from NEW, ALLOCATED, IN_ACTION", () => {
    assert.equal(validateNotARequestClose("NEW").ok, true);
    assert.equal(validateNotARequestClose("ALLOCATED").ok, true);
    assert.equal(validateNotARequestClose("IN_ACTION").ok, true);
  });

  it("rejected from OUTCOME, CLOSED, ARCHIVED", () => {
    assert.equal(validateNotARequestClose("OUTCOME").ok, false);
    assert.equal(validateNotARequestClose("CLOSED").ok, false);
    assert.equal(validateNotARequestClose("ARCHIVED").ok, false);
  });
});

describe("validateReassignment", () => {
  it("allowed for ALLOCATED and IN_ACTION", () => {
    assert.equal(validateReassignment("ALLOCATED").ok, true);
    assert.equal(validateReassignment("IN_ACTION").ok, true);
  });

  it("rejected for NEW, OUTCOME, CLOSED, ARCHIVED", () => {
    assert.equal(validateReassignment("NEW").ok, false);
    assert.equal(validateReassignment("OUTCOME").ok, false);
    assert.equal(validateReassignment("CLOSED").ok, false);
    assert.equal(validateReassignment("ARCHIVED").ok, false);
  });
});

describe("validateReversal (ADMIN-only, enforced by the caller -- this validates the move itself)", () => {
  it("allows any backward move", () => {
    assert.equal(validateReversal("CLOSED", "IN_ACTION", "cat-1").ok, true);
    assert.equal(validateReversal("OUTCOME", "ALLOCATED", null).ok, true);
    assert.equal(validateReversal("ARCHIVED", "CLOSED", null).ok, true);
  });

  it("rejects a same-or-forward move", () => {
    assert.equal(validateReversal("ALLOCATED", "ALLOCATED", null).ok, false);
    assert.equal(validateReversal("ALLOCATED", "IN_ACTION", "cat-1").ok, false);
  });

  it("a reversal into IN_ACTION still requires a category (§4)", () => {
    const result = validateReversal("CLOSED", "IN_ACTION", null);
    assert.equal(result.ok, false);
    assert.equal(result.status, 400);
    assert.match(result.error!, /category_id/);
  });
});
