// The permission matrix from build spec §3, translated literally into one
// function per row. Where a cell reads "assigned tickets" / "own tickets
// only" / "Only if granted" rather than a flat ✔/✘, the function takes the
// instance context needed to evaluate it -- callers (Stage 3+ ticket
// routes) supply that context; nothing here guesses at it.
//
// Every API route must call these server-side (§6: "Every API route
// re-checks role server-side. Never trust a client-supplied role.") --
// these functions are the single source of truth so a permission never
// silently drifts between the UI and the API.

import type { UserRole } from "./roles";

export type { UserRole };

/** View open pool -- ADMIN / HR_LEAD / HR_OFFICER. */
export function canViewOpenPool(_role: UserRole): boolean {
  return true;
}

/** Self-assign a pooled ticket -- ADMIN / HR_LEAD / HR_OFFICER. */
export function canSelfAssignPooledTicket(_role: UserRole): boolean {
  return true;
}

/** Reassign another user's ticket -- ADMIN / HR_LEAD unconditionally; HR_OFFICER only their own tickets. */
export function canReassignTicket(role: UserRole, isOwnTicket: boolean): boolean {
  if (role === "ADMIN" || role === "HR_LEAD") return true;
  return isOwnTicket;
}

/**
 * Edit ticket metadata (display subject, priority, CC list), set/change
 * category, set/change business unit, set/change target due date+reason,
 * draft and send outcome, close ticket -- all six rows share the identical
 * ADMIN/HR_LEAD-unconditional, HR_OFFICER-assigned-tickets-only shape.
 */
export function canActOnAssignedTicket(role: UserRole, isAssignedTicket: boolean): boolean {
  if (role === "ADMIN" || role === "HR_LEAD") return true;
  return isAssignedTicket;
}

/** Add internal notes -- ADMIN / HR_LEAD / HR_OFFICER, any ticket. */
export function canAddInternalNote(_role: UserRole): boolean {
  return true;
}

/** Edit own note (creates a revision) -- gated on ownership, not role; every role may edit a note they authored. */
export function canEditNote(_role: UserRole, isOwnNote: boolean): boolean {
  return isOwnNote;
}

/** "Not a request" close -- ADMIN / HR_LEAD / HR_OFFICER, any ticket. */
export function canCloseAsNotARequest(_role: UserRole): boolean {
  return true;
}

/** Set / clear confidential flag -- ADMIN / HR_LEAD only. */
export function canSetOrClearConfidentialFlag(role: UserRole): boolean {
  return role === "ADMIN" || role === "HR_LEAD";
}

export interface ConfidentialViewContext {
  isAssignee: boolean;
  hasExplicitGrant: boolean;
}

/**
 * View confidential ticket -- ADMIN and HR_LEAD see every confidential
 * ticket unconditionally (§9.2: no admin exclusion, ever); HR_OFFICER only
 * if they are the current assignee or hold an explicit ticket_access grant.
 */
export function canViewConfidentialTicket(role: UserRole, ctx: ConfidentialViewContext): boolean {
  if (role === "ADMIN" || role === "HR_LEAD") return true;
  return ctx.isAssignee || ctx.hasExplicitGrant;
}

/** Set / clear legal hold -- ADMIN only. */
export function canSetOrClearLegalHold(role: UserRole): boolean {
  return role === "ADMIN";
}

/** Reverse a status transition -- ADMIN only. */
export function canReverseStatusTransition(role: UserRole): boolean {
  return role === "ADMIN";
}

/** Amend an archived ticket -- ADMIN only. */
export function canAmendArchivedTicket(role: UserRole): boolean {
  return role === "ADMIN";
}

/** Soft-delete a ticket -- ADMIN only. */
export function canSoftDeleteTicket(role: UserRole): boolean {
  return role === "ADMIN";
}

/** Manage users, roles, suppression rules, categories, business units -- ADMIN only. */
export function canManageAdminSettings(role: UserRole): boolean {
  return role === "ADMIN";
}

/** View audit log -- ADMIN / HR_LEAD only. */
export function canViewAuditLog(role: UserRole): boolean {
  return role === "ADMIN" || role === "HR_LEAD";
}

/** Bulk export -- ADMIN / HR_LEAD only. */
export function canBulkExport(role: UserRole): boolean {
  return role === "ADMIN" || role === "HR_LEAD";
}

// ---------- Step-up re-authentication (§6) ----------
// The seven actions requiring a fresh Entra prompt within the last 5
// minutes. Listed here as a single source of truth for which actions
// require it -- lib/step-up.ts owns the actual freshness check.
export const STEP_UP_REQUIRED_ACTIONS = [
  "ARCHIVE_AMENDMENT",
  "SOFT_DELETE",
  "CONFIDENTIAL_FLAG_CLEAR",
  "STATUS_REVERSAL",
  "USER_ROLE_CHANGE",
  "LEGAL_HOLD_SET",
  "LEGAL_HOLD_CLEAR",
] as const;

export type StepUpAction = (typeof STEP_UP_REQUIRED_ACTIONS)[number];
