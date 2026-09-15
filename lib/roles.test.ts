import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { deriveRole } from "./roles";

const mapping = {
  adminsGroupId: "admins-id",
  leadsGroupId: "leads-id",
  usersGroupId: "users-id",
};

describe("deriveRole", () => {
  it("returns ADMIN when the admins group is present", () => {
    assert.equal(deriveRole(["admins-id"], mapping), "ADMIN");
  });

  it("returns HR_LEAD when the leads group is present", () => {
    assert.equal(deriveRole(["leads-id"], mapping), "HR_LEAD");
  });

  it("returns HR_OFFICER when the users group is present", () => {
    assert.equal(deriveRole(["users-id"], mapping), "HR_OFFICER");
  });

  it("highest role wins when a user is in multiple groups (§3)", () => {
    assert.equal(deriveRole(["users-id", "admins-id"], mapping), "ADMIN");
    assert.equal(deriveRole(["users-id", "leads-id"], mapping), "HR_LEAD");
    assert.equal(deriveRole(["leads-id", "admins-id"], mapping), "ADMIN");
    assert.equal(deriveRole(["users-id", "leads-id", "admins-id"], mapping), "ADMIN");
  });

  it("returns null when none of the three groups match (caller must deny, not 500)", () => {
    assert.equal(deriveRole(["some-other-group"], mapping), null);
    assert.equal(deriveRole([], mapping), null);
  });

  it("returns null when the mapping itself has unset group IDs (§14 not done yet)", () => {
    assert.equal(deriveRole(["admins-id"], {}), null);
  });
});
