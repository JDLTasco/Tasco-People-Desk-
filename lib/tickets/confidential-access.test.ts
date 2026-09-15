import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { determineAccessBasis } from "./confidential-access";

describe("determineAccessBasis (§9.1 -- most specific wins: assignee over ACL over role)", () => {
  it("ASSIGNEE wins even when the viewer also holds a grant or an admin/lead role", () => {
    assert.equal(determineAccessBasis("HR_OFFICER", true, true), "ASSIGNEE");
    assert.equal(determineAccessBasis("ADMIN", true, true), "ASSIGNEE");
  });

  it("ACL_GRANTED wins over a bare role when not the assignee", () => {
    assert.equal(determineAccessBasis("HR_OFFICER", false, true), "ACL_GRANTED");
    assert.equal(determineAccessBasis("HR_LEAD", false, true), "ACL_GRANTED");
  });

  it("falls back to the viewer's own role when neither assignee nor granted", () => {
    assert.equal(determineAccessBasis("ADMIN", false, false), "ADMIN");
    assert.equal(determineAccessBasis("HR_LEAD", false, false), "HR_LEAD");
  });
});
