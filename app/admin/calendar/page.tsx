import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { canManageAdminSettings } from "@/lib/rbac";
import CalendarAdminPanel from "./calendar-admin-panel";

// Admin -> Calendar (John, 2026-10-03): the non-working days that the
// automatic target due date skips (Victorian public holidays, Tasco
// shutdowns). ADMIN only.
export default async function CalendarAdminPage() {
  const session = await getSession();
  if (!session?.user) return null;
  if (!canManageAdminSettings(session.user.role)) {
    return (
      <main>
        <h1>Not permitted</h1>
        <p>Only ADMIN users can manage the business calendar.</p>
      </main>
    );
  }

  const days = await prisma.nonWorkingDay.findMany({ orderBy: { date: "asc" } });

  return (
    <main>
      <h1>Admin -- Calendar</h1>
      <p>
        Working days are Monday to Friday, except the dates listed here. The automatic target due date (P1 = 3, P2 = 10,
        P3 = 20 working days) skips them. Changes apply to targets calculated from now on -- existing tickets&apos; target
        dates are not changed. The 2026 and 2027 Victorian public holidays are loaded; add AFL Grand Final Friday 2027
        once it is announced, any Tasco shutdown days, and any local holiday that replaces Melbourne Cup Day.
      </p>
      <CalendarAdminPanel
        days={days.map((d) => ({ id: d.id, date: d.date.toISOString().slice(0, 10), name: d.name, isRecurring: d.isRecurring }))}
      />
    </main>
  );
}
