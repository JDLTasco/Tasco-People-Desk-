import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeDesiredUsers, deriveInitials, type RoleGroupMembers } from "./sync-users-core";
import type { RoleGroupMapping } from "../roles";

const mapping: RoleGroupMapping = {
  adminsGroupId: "admins-group",
  leadsGroupId: "leads-group",
  usersGroupId: "users-group",
};

const alice = { entraObjectId: "alice", displayName: "Alice Admin", upn: "alice@tasco" };
const bob = { entraObjectId: "bob", displayName: "Bob Lead", upn: "bob@tasco" };
const carol = { entraObjectId: "carol", displayName: "Carol Officer", upn: "carol@tasco" };

describe("computeDesiredUsers", () => {
  it("assigns roles from single group membership", () => {
    const groups: RoleGroupMembers = { admins: [alice], leads: [bob], users: [carol] };
    const desired = computeDesiredUsers(groups, mapping);
    assert.deepEqual(
      desired.map((d) => [d.entraObjectId, d.role]).sort(),
      [
        ["alice", "ADMIN"],
        ["bob", "HR_LEAD"],
        ["carol", "HR_OFFICER"],
      ],
    );
  });

  it("gives highest-role-wins when a user is in more than one group (§3)", () => {
    const groups: RoleGroupMembers = { admins: [alice], leads: [alice], users: [alice] };
    const desired = computeDesiredUsers(groups, mapping);
    assert.equal(desired.length, 1);
    assert.equal(desired[0].role, "ADMIN");
  });

  it("excludes a group with no configured ID rather than crashing", () => {
    const groups: RoleGroupMembers = { admins: [alice], leads: [], users: [] };
    const desired = computeDesiredUsers(groups, { adminsGroupId: "admins-group" });
    assert.deepEqual(desired.map((d) => d.entraObjectId), ["alice"]);
  });

  it("returns nobody when no groups are configured", () => {
    const groups: RoleGroupMembers = { admins: [alice], leads: [bob], users: [carol] };
    assert.deepEqual(computeDesiredUsers(groups, {}), []);
  });
});

describe("deriveInitials", () => {
  it("takes the first two characters, uppercased", () => {
    assert.equal(deriveInitials("Robert Jones"), "RO");
  });

  it("falls back to ?? for an empty name", () => {
    assert.equal(deriveInitials(""), "??");
  });
});
