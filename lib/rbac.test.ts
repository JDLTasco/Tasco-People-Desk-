import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canActOnAssignedTicket,
  canAddInternalNote,
  canAmendArchivedTicket,
  canBulkExport,
  canCloseAsAutoclose,
  canCloseAsNotARequest,
  canEditNote,
  canManageAdminSettings,
  canMergeTickets,
  canReassignTicket,
  canReverseStatusTransition,
  canSelfAssignPooledTicket,
  canSetOrClearConfidentialFlag,
  canSetOrClearLegalHold,
  canSoftDeleteTicket,
  canViewAuditLog,
  canViewConfidentialTicket,
  canViewOpenPool,
} from "./rbac";
import type { UserRole } from "./roles";

const ADMIN: UserRole = "ADMIN";
const HR_LEAD: UserRole = "HR_LEAD";
const HR_OFFICER: UserRole = "HR_OFFICER";
const ALL_ROLES: UserRole[] = [ADMIN, HR_LEAD, HR_OFFICER];

describe("§3 permission matrix -- unconditional rows (✔ for all three roles)", () => {
  for (const role of ALL_ROLES) {
    it(`View open pool: ${role} can`, () => {
      assert.equal(canViewOpenPool(role), true);
    });

    it(`Self-assign a pooled ticket: ${role} can`, () => {
      assert.equal(canSelfAssignPooledTicket(role), true);
    });

    it(`Add internal notes: ${role} can`, () => {
      assert.equal(canAddInternalNote(role), true);
    });

    it(`"Not a request" close: ${role} can`, () => {
      assert.equal(canCloseAsNotARequest(role), true);
    });

    it(`Autoclose (spam / no action needed): ${role} can`, () => {
      assert.equal(canCloseAsAutoclose(role), true);
    });
  }
});

describe("Merge one ticket into another (added directly with John, Sep 2026)", () => {
  it("ADMIN and HR_LEAD can merge any pair of tickets", () => {
    assert.equal(canMergeTickets(ADMIN, false), true);
    assert.equal(canMergeTickets(HR_LEAD, false), true);
  });

  it("HR_OFFICER can only merge when they're the assignee of at least one of the two tickets", () => {
    assert.equal(canMergeTickets(HR_OFFICER, true), true);
    assert.equal(canMergeTickets(HR_OFFICER, false), false);
  });
});

describe("Reassign another user's ticket", () => {
  it("ADMIN and HR_LEAD can reassign any ticket", () => {
    assert.equal(canReassignTicket(ADMIN, false), true);
    assert.equal(canReassignTicket(HR_LEAD, false), true);
  });

  it("HR_OFFICER can only reassign their own ticket", () => {
    assert.equal(canReassignTicket(HR_OFFICER, true), true);
    assert.equal(canReassignTicket(HR_OFFICER, false), false);
  });
});

describe("Ticket-metadata actions gated on assignment (edit metadata, category, business unit, target due date, draft+send outcome, close ticket)", () => {
  it("ADMIN and HR_LEAD can act regardless of assignment", () => {
    assert.equal(canActOnAssignedTicket(ADMIN, false), true);
    assert.equal(canActOnAssignedTicket(HR_LEAD, false), true);
  });

  it("HR_OFFICER can only act on tickets assigned to them", () => {
    assert.equal(canActOnAssignedTicket(HR_OFFICER, true), true);
    assert.equal(canActOnAssignedTicket(HR_OFFICER, false), false);
  });
});

describe("Edit own note (creates a revision)", () => {
  it("any role may edit a note they authored", () => {
    for (const role of ALL_ROLES) {
      assert.equal(canEditNote(role, true), true);
    }
  });

  it("no role may edit a note authored by someone else", () => {
    for (const role of ALL_ROLES) {
      assert.equal(canEditNote(role, false), false);
    }
  });
});

describe("Set / clear confidential flag", () => {
  it("ADMIN and HR_LEAD can", () => {
    assert.equal(canSetOrClearConfidentialFlag(ADMIN), true);
    assert.equal(canSetOrClearConfidentialFlag(HR_LEAD), true);
  });

  it("HR_OFFICER cannot", () => {
    assert.equal(canSetOrClearConfidentialFlag(HR_OFFICER), false);
  });
});

describe("View confidential ticket", () => {
  it("ADMIN and HR_LEAD see every confidential ticket unconditionally (§9.2 -- no admin exclusion)", () => {
    const noAccess = { isAssignee: false, hasExplicitGrant: false };
    assert.equal(canViewConfidentialTicket(ADMIN, noAccess), true);
    assert.equal(canViewConfidentialTicket(HR_LEAD, noAccess), true);
  });

  it("HR_OFFICER sees it only as the assignee or with an explicit grant", () => {
    assert.equal(canViewConfidentialTicket(HR_OFFICER, { isAssignee: true, hasExplicitGrant: false }), true);
    assert.equal(canViewConfidentialTicket(HR_OFFICER, { isAssignee: false, hasExplicitGrant: true }), true);
    assert.equal(canViewConfidentialTicket(HR_OFFICER, { isAssignee: false, hasExplicitGrant: false }), false);
  });
});

describe("ADMIN-only rows (legal hold, reversal, archive amendment, soft-delete, admin settings)", () => {
  const adminOnlyChecks: Array<[string, (role: UserRole) => boolean]> = [
    ["Set / clear legal hold", canSetOrClearLegalHold],
    ["Reverse a status transition", canReverseStatusTransition],
    ["Amend an archived ticket", canAmendArchivedTicket],
    ["Soft-delete a ticket", canSoftDeleteTicket],
    ["Manage users/roles/suppression/categories/business units", canManageAdminSettings],
  ];

  for (const [label, check] of adminOnlyChecks) {
    it(`${label}: only ADMIN can`, () => {
      assert.equal(check(ADMIN), true);
      assert.equal(check(HR_LEAD), false);
      assert.equal(check(HR_OFFICER), false);
    });
  }
});

describe("ADMIN/HR_LEAD-only rows (audit log, bulk export)", () => {
  const leadAndAboveChecks: Array<[string, (role: UserRole) => boolean]> = [
    ["View audit log", canViewAuditLog],
    ["Bulk export", canBulkExport],
  ];

  for (const [label, check] of leadAndAboveChecks) {
    it(`${label}: ADMIN and HR_LEAD can, HR_OFFICER cannot`, () => {
      assert.equal(check(ADMIN), true);
      assert.equal(check(HR_LEAD), true);
      assert.equal(check(HR_OFFICER), false);
    });
  }
});
