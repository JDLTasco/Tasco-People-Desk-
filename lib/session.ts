import { getServerSession, type Session } from "next-auth";
import { authOptions } from "./auth";
import type { UserRole } from "./roles";
import { hasRecentStepUp } from "./step-up";

/**
 * The one place every API route calls to get the current session. §6:
 * "Every API route re-checks role server-side. Never trust a client-
 * supplied role." -- there is no other source of truth for role than this.
 */
export async function getSession(): Promise<Session | null> {
  return getServerSession(authOptions);
}

/** True when the session's role is one of allowedRoles. Never trusts anything but the server session. */
export function hasRole(session: Session, allowedRoles: UserRole[]): boolean {
  return allowedRoles.includes(session.user.role);
}

/** True when this session has a fresh (within 5 minutes) prompt=login re-authentication (§6). */
export function hasFreshStepUp(session: Session): boolean {
  return hasRecentStepUp(session.stepUpAt);
}
