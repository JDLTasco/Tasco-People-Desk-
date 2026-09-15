import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { canManageAdminSettings } from "@/lib/rbac";
import { SYSTEM_ENTRA_OBJECT_ID } from "@/lib/ingestion/process-message";
import UserAdminPanel from "./user-admin-panel";

// §3/§13: Admin "users" screen -- ADMIN only. §16 doesn't assign this to a
// specific numbered stage; built when John asked for it directly.
export default async function AdminUsersPage() {
  const session = await getSession();
  if (!session?.user) return null;

  if (!canManageAdminSettings(session.user.role)) {
    return (
      <main>
        <h1>Not permitted</h1>
        <p>Only ADMIN users can manage users.</p>
      </main>
    );
  }

  const users = await prisma.user.findMany({
    where: { entraObjectId: { not: SYSTEM_ENTRA_OBJECT_ID } },
    orderBy: { displayName: "asc" },
  });

  return (
    <main>
      <h1>Admin -- Users</h1>
      <p>
        Real accounts are normally created automatically the first time someone signs in via Microsoft Entra
        (role derived from their security group membership, §3). This screen also lets you pre-provision a user
        manually -- useful now, since real Entra sign-in isn&apos;t wired up yet (§14).
      </p>
      <UserAdminPanel
        users={users.map((u) => ({
          id: u.id,
          displayName: u.displayName,
          initials: u.initials,
          upn: u.upn,
          role: u.role,
          isActive: u.isActive,
          entraObjectId: u.entraObjectId,
          lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
        }))}
      />
    </main>
  );
}
