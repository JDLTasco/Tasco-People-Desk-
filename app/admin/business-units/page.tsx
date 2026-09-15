import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { canManageAdminSettings } from "@/lib/rbac";
import BusinessUnitAdminPanel from "./business-unit-admin-panel";

// §3/§13: Admin "business units" screen -- ADMIN only. §16 doesn't assign
// this to a specific numbered stage; built when John asked to rename two
// existing units and there was no admin UI at all for this lookup table.
export default async function AdminBusinessUnitsPage() {
  const session = await getSession();
  if (!session?.user) return null;

  if (!canManageAdminSettings(session.user.role)) {
    return (
      <main>
        <h1>Not permitted</h1>
        <p>Only ADMIN users can manage business units.</p>
      </main>
    );
  }

  const businessUnits = await prisma.businessUnit.findMany({ orderBy: { sortOrder: "asc" } });

  return (
    <main>
      <h1>Admin -- Business units</h1>
      <p>
        Business units are deactivated, never deleted (§5) -- existing tickets keep their business unit even after
        it&apos;s deactivated here, they just stop appearing in the selector for new assignment.
      </p>
      <BusinessUnitAdminPanel
        businessUnits={businessUnits.map((b) => ({ id: b.id, name: b.name, isActive: b.isActive }))}
      />
    </main>
  );
}
