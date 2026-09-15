// Step-up re-authentication (§6): "a fresh Entra prompt (prompt=login)
// within the last 5 minutes, or reject" -- required for archive amendment,
// soft-delete, confidential flag clear, status reversal, user role change,
// legal hold set, and legal hold clear (§0.1's STEP_UP_REQUIRED_ACTIONS in
// lib/rbac.ts).
//
// lib/auth.ts's JWT callback stamps `stepUpAt` (epoch ms) whenever a
// sign-in completed with prompt=login. This module only judges freshness --
// it has no opinion on how that timestamp got there.

export const STEP_UP_WINDOW_MS = 5 * 60 * 1000;

/**
 * True when stepUpAt is within the last 5 minutes of `now`. A missing
 * stepUpAt (never stepped up this session) is never fresh.
 */
export function hasRecentStepUp(stepUpAt: number | undefined | null, now: number = Date.now()): boolean {
  if (!stepUpAt) return false;
  const age = now - stepUpAt;
  // A negative age (a clock-skewed or fabricated future timestamp) is
  // exactly as untrustworthy as a stale one -- never treat it as fresh.
  return age >= 0 && age <= STEP_UP_WINDOW_MS;
}

export class StepUpRequiredError extends Error {
  constructor(action: string) {
    super(`Step-up re-authentication required for ${action}`);
    this.name = "StepUpRequiredError";
  }
}

/** Throws StepUpRequiredError when the session's last step-up isn't fresh. */
export function requireRecentStepUp(
  stepUpAt: number | undefined | null,
  action: string,
  now: number = Date.now(),
): void {
  if (!hasRecentStepUp(stepUpAt, now)) {
    throw new StepUpRequiredError(action);
  }
}
