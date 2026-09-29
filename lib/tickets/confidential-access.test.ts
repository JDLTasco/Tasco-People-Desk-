import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canViewerSeeTicket, determineAccessBasis } from "./confidential-access";

describe("canViewerSeeTicket (§9 gate for write routes)", () => {
  const open = { isConfidential: false, assignedToId: "someone", accessGrants: [] };
  const confidential = { isConfidential: true, assignedToId: "assignee", accessGrants: [{ userId: "granted" }] };

  it("every role sees a non-confidential ticket, assigned or not", () => {
    assert.equal(canViewerSeeTicket("HR_OFFICER", "me", open), true);
  });

  it("an HR_OFFICER sees a confidential ticket only as assignee or grantee", () => {
    assert.equal(canViewerSeeTicket("HR_OFFICER", "me", confidential), false);
    assert.equal(canViewerSeeTicket("HR_OFFICER", "assignee", confidential), true);
    assert.equal(canViewerSeeTicket("HR_OFFICER", "granted", confidential), true);
  });

  it("ADMIN and HR_LEAD see every confidential ticket", () => {
    assert.equal(canViewerSeeTicket("ADMIN", "me", confidential), true);
    assert.equal(canViewerSeeTicket("HR_LEAD", "me", confidential), true);
  });
});

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
