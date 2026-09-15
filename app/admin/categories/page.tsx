import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { canManageAdminSettings } from "@/lib/rbac";
import CategoryAdminPanel from "./category-admin-panel";

// §3/§13: Admin "categories" screen -- ADMIN only. Mirrors
// app/admin/business-units exactly -- same gap, built straight after it
// at John's request (2026-09-16).
export default async function AdminCategoriesPage() {
  const session = await getSession();
  if (!session?.user) return null;

  if (!canManageAdminSettings(session.user.role)) {
    return (
      <main>
        <h1>Not permitted</h1>
        <p>Only ADMIN users can manage categories.</p>
      </main>
    );
  }

  const categories = await prisma.category.findMany({ orderBy: { sortOrder: "asc" } });

  return (
    <main>
      <h1>Admin -- Categories</h1>
      <p>
        Categories are deactivated, never deleted (§5) -- existing tickets keep their category even after it&apos;s
        deactivated here, they just stop appearing in the selector for new assignment.
      </p>
      <CategoryAdminPanel categories={categories.map((c) => ({ id: c.id, name: c.name, isActive: c.isActive }))} />
    </main>
  );
}
