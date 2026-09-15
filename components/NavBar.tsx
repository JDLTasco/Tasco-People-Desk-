import Link from "next/link";
import { getSession } from "@/lib/session";
import { canManageAdminSettings, canViewAuditLog } from "@/lib/rbac";
import SignOutButton from "./SignOutButton";

// §13's view list. Archive Search (full-text over archive artefacts,
// Stage 6) isn't linked yet -- Closed here is a lighter-weight history
// list, not that feature.
export default async function NavBar() {
  const session = await getSession();
  if (!session?.user) return null;

  return (
    <nav className="main-nav no-print">
      <span className="nav-brand">Tasco People Desk</span>
      <Link href="/pool">Pool</Link>
      <Link href="/my-tickets">My tickets</Link>
      <Link href="/all-open">All open</Link>
      <Link href="/overdue">Overdue</Link>
      <Link href="/closed">Closed</Link>
      <Link href="/archive-search">Archive search</Link>
      {canManageAdminSettings(session.user.role) && <Link href="/admin/users">Admin</Link>}
      {canManageAdminSettings(session.user.role) && <Link href="/admin/failed-sends">Failed sends</Link>}
      {canViewAuditLog(session.user.role) && <Link href="/admin/legal-holds">Legal holds</Link>}
      {canManageAdminSettings(session.user.role) && <Link href="/admin/deleted">Deleted</Link>}
      {canViewAuditLog(session.user.role) && <Link href="/admin/audit-log">Audit log</Link>}
      <span className="nav-spacer">
        {session.user.name} ({session.user.role})
      </span>
      <SignOutButton />
    </nav>
  );
}
