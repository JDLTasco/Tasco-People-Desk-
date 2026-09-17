import { deriveRole, type RoleGroupMapping, type UserRole } from "../roles";

export interface GroupMemberInput {
  entraObjectId: string;
  displayName: string;
  upn: string;
}

export interface RoleGroupMembers {
  admins: GroupMemberInput[];
  leads: GroupMemberInput[];
  users: GroupMemberInput[];
}

export interface DesiredUser {
  entraObjectId: string;
  displayName: string;
  upn: string;
  role: UserRole;
}

/**
 * Combines the three role groups' membership lists into one desired-state
 * map, reusing `deriveRole`'s existing highest-role-wins precedence (§3) so
 * a user in more than one group gets exactly the role the sign-in path
 * would also compute for them -- one rule, not two copies of it.
 */
export function computeDesiredUsers(groups: RoleGroupMembers, mapping: RoleGroupMapping): DesiredUser[] {
  const byId = new Map<string, { displayName: string; upn: string; groupIds: Set<string> }>();

  const record = (member: GroupMemberInput, groupId: string | undefined) => {
    if (!groupId) return;
    const existing = byId.get(member.entraObjectId);
    if (existing) {
      existing.groupIds.add(groupId);
      // Later lists (leads, users) shouldn't clobber a name already seen in
      // an earlier one -- membership order shouldn't matter, so keep the
      // first non-empty values.
    } else {
      byId.set(member.entraObjectId, { displayName: member.displayName, upn: member.upn, groupIds: new Set([groupId]) });
    }
  };

  groups.admins.forEach((m) => record(m, mapping.adminsGroupId));
  groups.leads.forEach((m) => record(m, mapping.leadsGroupId));
  groups.users.forEach((m) => record(m, mapping.usersGroupId));

  const desired: DesiredUser[] = [];
  for (const [entraObjectId, info] of Array.from(byId)) {
    const role = deriveRole(Array.from(info.groupIds), mapping);
    if (!role) continue; // unreachable given `record` only adds configured group IDs, but never trust it blindly
    desired.push({ entraObjectId, displayName: info.displayName, upn: info.upn, role });
  }
  return desired;
}

/** First two letters of a display name, uppercased -- same derivation `lib/auth.ts`'s jwt callback uses for a freshly-seen Entra user. */
export function deriveInitials(displayName: string): string {
  return (displayName || "??").slice(0, 2).toUpperCase();
}
