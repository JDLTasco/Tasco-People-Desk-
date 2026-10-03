import Image from "next/image";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { canManageAdminSettings, canViewAuditLog } from "@/lib/rbac";
import SignOutButton from "./SignOutButton";
import ThemeToggle from "./ThemeToggle";
import RefreshButton from "./RefreshButton";
import AdminMenu from "./AdminMenu";
import NavLinks from "./NavLinks";
import { countResponseAlerts } from "@/lib/tickets/queries";
import { APP_VERSION } from "@/lib/version";

// §13's view list. Archive Search (full-text over archive artefacts,
// Stage 6) isn't linked yet -- Closed here is a lighter-weight history
// list, not that feature.
export default async function NavBar() {
  const session = await getSession();
  if (!session?.user) return null;
  // "Response received" alerts (2026-09-29): someone else recorded a
  // response on one of this user's tickets and they haven't opened it yet.
  const responseAlerts = await countResponseAlerts(session.user.id);
  const isAdmin = canManageAdminSettings(session.user.role);
  const canAudit = canViewAuditLog(session.user.role);
  // Grouped under one "Admin" menu (2026-10-03) -- same permissions as before.
  const adminLinks = [
    ...(isAdmin
      ? [
          { href: "/admin/users", label: "Users" },
          { href: "/admin/categories", label: "Categories" },
          { href: "/admin/business-units", label: "Business units" },
          { href: "/admin/action-items", label: "Action items" },
          { href: "/admin/failed-sends", label: "Failed sends" },
        ]
      : []),
    ...(canAudit ? [{ href: "/admin/legal-holds", label: "Legal holds" }] : []),
    ...(isAdmin ? [{ href: "/admin/deleted", label: "Deleted" }] : []),
    ...(canAudit
      ? [
          { href: "/admin/address-book", label: "Address book" },
          { href: "/admin/audit-log", label: "Audit log" },
        ]
      : []),
  ];

  return (
    <nav className="main-nav no-print">
      <span className="nav-logo">
        <Image src="/tasco-logo.jpg" alt="Tasco Petroleum" width={531} height={272} priority unoptimized />
      </span>
      <span className="nav-brand">
        Tasco People Desk <span className="nav-version">v{APP_VERSION}</span>
      </span>
      <NavLinks>
      <Link href="/pool">Pool</Link>
      <Link href="/my-tickets">
        My tickets
        {responseAlerts > 0 && (
          <span className="nav-badge" title={`${responseAlerts} ticket(s) with a new response`}>
            {responseAlerts}
          </span>
        )}
      </Link>
      <Link href="/all-open">All open</Link>
      <Link href="/overdue">Overdue</Link>
      <Link href="/closed">Closed</Link>
      <Link href="/archive-search">Archive search</Link>
      <Link href="/instructions">Instructions</Link>
      {adminLinks.length > 0 && <AdminMenu links={adminLinks} />}
      <span className="nav-spacer">
        {session.user.name} ({session.user.role})
      </span>
      <RefreshButton />
      <ThemeToggle />
      <SignOutButton />
      </NavLinks>
    </nav>
  );
}
