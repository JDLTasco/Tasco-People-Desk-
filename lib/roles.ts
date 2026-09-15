// Role derivation from Entra ID security group membership (build spec §3).
//
//   HR-Ticketing-Admins -> ADMIN
//   HR-Ticketing-Leads  -> HR_LEAD
//   HR-Ticketing-Users  -> HR_OFFICER
//
// "A user in multiple groups receives the highest role. A user in no group
// is denied access with a clear message, not a 500." Group *names* aren't
// visible to the app -- Entra ID tokens carry group Object IDs -- so the
// mapping from real group IDs to these three names is environment
// configuration (set once §14 creates the real groups), not hardcoded here.
// This function is pure and fully testable with synthetic IDs regardless of
// whether those env vars are populated yet.

export type UserRole = "ADMIN" | "HR_LEAD" | "HR_OFFICER";

export interface RoleGroupMapping {
  adminsGroupId?: string;
  leadsGroupId?: string;
  usersGroupId?: string;
}

/**
 * Highest-role-wins, per §3. Returns null when the signed-in user's group
 * memberships don't include any of the three configured groups -- the
 * caller is responsible for denying access with a clear message in that
 * case (see lib/auth.ts's signIn callback), never a 500.
 */
export function deriveRole(groupIds: string[], mapping: RoleGroupMapping): UserRole | null {
  const groupIdSet = new Set(groupIds);

  if (mapping.adminsGroupId && groupIdSet.has(mapping.adminsGroupId)) {
    return "ADMIN";
  }
  if (mapping.leadsGroupId && groupIdSet.has(mapping.leadsGroupId)) {
    return "HR_LEAD";
  }
  if (mapping.usersGroupId && groupIdSet.has(mapping.usersGroupId)) {
    return "HR_OFFICER";
  }
  return null;
}

/** Reads the three group-ID env vars into a RoleGroupMapping. */
export function roleGroupMappingFromEnv(): RoleGroupMapping {
  return {
    adminsGroupId: process.env.AZURE_AD_GROUP_ADMINS_ID || undefined,
    leadsGroupId: process.env.AZURE_AD_GROUP_LEADS_ID || undefined,
    usersGroupId: process.env.AZURE_AD_GROUP_USERS_ID || undefined,
  };
}
