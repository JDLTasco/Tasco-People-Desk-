import { getSession } from "@/lib/session";
import { canViewAuditLog } from "@/lib/rbac";
import AuditLogClient from "./audit-log-client";

// §11 "Audit search": by ticket, actor, action, date range, correlation
// ID. ADMIN/HR_LEAD per §3's permission matrix.
export default async function AuditLogPage() {
  const session = await getSession();
  if (!session?.user) return null;
  if (!canViewAuditLog(session.user.role)) {
    return (
      <main>
        <h1>Not permitted</h1>
        <p>Only ADMIN or HR_LEAD can view the audit log.</p>
      </main>
    );
  }

  return (
    <main>
      <h1>Admin -- Audit log</h1>
      <AuditLogClient />
    </main>
  );
}
