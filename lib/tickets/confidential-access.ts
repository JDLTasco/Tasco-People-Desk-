// §9.1: "Where more than one basis applies, record the most specific
// (assignee over ACL over role)." Pure -- only ever called after
// canViewConfidentialTicket() has already confirmed the viewer is
// allowed through, so by the time role-based fallback is reached, role
// is guaranteed to actually be ADMIN or HR_LEAD (an HR_OFFICER who is
// neither the assignee nor explicitly granted would never have gotten
// this far).
import type { AccessBasis } from "@prisma/client";
import type { UserRole } from "../roles";
import { canViewConfidentialTicket } from "../rbac";

export interface TicketVisibilityFacts {
  isConfidential: boolean;
  assignedToId: string | null;
  accessGrants: { userId: string }[];
}

/**
 * §9's view gate as a single yes/no for write routes that don't go through
 * loadTicketForViewer() -- a caller who can't see a confidential ticket
 * must get the same 404 there as on the detail page, never a way to act
 * on it by id.
 */
export function canViewerSeeTicket(role: UserRole, userId: string, ticket: TicketVisibilityFacts): boolean {
  if (!ticket.isConfidential) return true;
  return canViewConfidentialTicket(role, {
    isAssignee: ticket.assignedToId === userId,
    hasExplicitGrant: ticket.accessGrants.some((g) => g.userId === userId),
  });
}

export function determineAccessBasis(role: UserRole, isAssignee: boolean, hasExplicitGrant: boolean): AccessBasis {
  if (isAssignee) return "ASSIGNEE";
  if (hasExplicitGrant) return "ACL_GRANTED";
  return role === "ADMIN" ? "ADMIN" : "HR_LEAD";
}
