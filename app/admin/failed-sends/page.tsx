import Link from "next/link";
import { getSession } from "@/lib/session";
import { canManageAdminSettings } from "@/lib/rbac";
import { getFailedSends } from "@/lib/email/failed-sends";

// §7.4: "Failed sends ... surface as ... an entry in the ADMIN failed-sends
// view." Read-only -- the spec defines no retry/resend action, only
// visibility. ADMIN-gated same as the other admin screens.
export default async function FailedSendsPage() {
  const session = await getSession();
  if (!session?.user) return null;

  if (!canManageAdminSettings(session.user.role)) {
    return (
      <main>
        <h1>Not permitted</h1>
        <p>Only ADMIN users can view failed sends.</p>
      </main>
    );
  }

  const failedSends = await getFailedSends();

  return (
    <main>
      <h1>Admin -- Failed sends</h1>
      <p>Emails that never delivered after 3 attempts (allocation, outcome, and SLA escalation sends).</p>
      {failedSends.length === 0 && <p>No failed sends.</p>}
      {failedSends.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Ticket</th>
              <th>Type</th>
              <th>To</th>
              <th>Attempts</th>
              <th>Last attempt</th>
              <th>Last error</th>
            </tr>
          </thead>
          <tbody>
            {failedSends.map((f) => (
              <tr key={f.ticketMessageId}>
                <td>
                  <Link href={`/tickets/${f.ticketId}`}>
                    {f.ticketNo} -- {f.displaySubject}
                  </Link>
                </td>
                <td>{f.messageType}</td>
                <td>{f.toRecipients.join(", ")}</td>
                <td>{f.attempts}</td>
                <td>{f.lastAttemptAt.toLocaleString()}</td>
                <td>{f.lastError}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
