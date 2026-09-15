// §9.1: "Where more than one basis applies, record the most specific
// (assignee over ACL over role)." Pure -- only ever called after
// canViewConfidentialTicket() has already confirmed the viewer is
// allowed through, so by the time role-based fallback is reached, role
// is guaranteed to actually be ADMIN or HR_LEAD (an HR_OFFICER who is
// neither the assignee nor explicitly granted would never have gotten
// this far).
import type { AccessBasis } from "@prisma/client";
import type { UserRole } from "../roles";

export function determineAccessBasis(role: UserRole, isAssignee: boolean, hasExplicitGrant: boolean): AccessBasis {
  if (isAssignee) return "ASSIGNEE";
  if (hasExplicitGrant) return "ACL_GRANTED";
  return role === "ADMIN" ? "ADMIN" : "HR_LEAD";
}
