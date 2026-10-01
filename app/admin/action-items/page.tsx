import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { canManageAdminSettings } from "@/lib/rbac";
import ActionItemAdminPanel from "./action-item-admin-panel";

// Action items (operator addition, John 2026-10-01) -- ADMIN only. Same
// shape as app/admin/categories.
export default async function AdminActionItemsPage() {
  const session = await getSession();
  if (!session?.user) return null;

  if (!canManageAdminSettings(session.user.role)) {
    return (
      <main>
        <h1>Not permitted</h1>
        <p>Only ADMIN users can manage action items.</p>
      </main>
    );
  }

  const items = await prisma.actionStatus.findMany({ orderBy: { sortOrder: "asc" } });

  return (
    <main>
      <h1>Admin -- Action items</h1>
      <p>
        Each active item appears as a button in a ticket&apos;s Action section while the ticket is in action. Setting
        one shows its name in place of the status (the ticket stays IN_ACTION underneath, and the due-date clock keeps
        running). Any staff member can set an item; only the assignee, HR Leads and Admins can clear it. It clears
        automatically when the ticket moves to any other status.
      </p>
      <p>
        <em>Mark awaiting response</em> and <em>Mark response received</em> are built in and aren&apos;t listed here.
        Items are deactivated, never deleted.
      </p>
      <ActionItemAdminPanel items={items.map((i) => ({ id: i.id, name: i.name, isActive: i.isActive }))} />
    </main>
  );
}
