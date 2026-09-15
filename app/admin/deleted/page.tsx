import { getSession } from "@/lib/session";
import { canSoftDeleteTicket } from "@/lib/rbac";
import { getDeletedTickets } from "@/lib/tickets/queries";

// §10 "Deletion": "Removed from all views except an ADMIN 'Deleted' view."
export default async function DeletedTicketsPage() {
  const session = await getSession();
  if (!session?.user) return null;
  if (!canSoftDeleteTicket(session.user.role)) {
    return (
      <main>
        <h1>Not permitted</h1>
        <p>Only ADMIN can view deleted tickets.</p>
      </main>
    );
  }

  const deleted = await getDeletedTickets();

  return (
    <main>
      <h1>Admin -- Deleted</h1>
      {deleted.length === 0 && <p>No deleted tickets.</p>}
      {deleted.length > 0 && (
        <>
          {/* No link to /tickets/[id] here -- loadTicketForViewer() deliberately
              excludes is_deleted tickets from every view, this one included;
              the spec asks for a list, not a working detail drill-down. */}
          <table>
            <thead>
              <tr>
                <th>Ticket number</th>
                <th>Subject</th>
                <th>Deleted by</th>
                <th>Deleted at</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {deleted.map((t) => (
                <tr key={t.id}>
                  <td>{t.ticketNo}</td>
                  <td>{t.subject}</td>
                  <td>{t.deletedBy?.displayName ?? "(unknown)"}</td>
                  <td>{t.deletedAt?.toLocaleString() ?? ""}</td>
                  <td>{t.deleteReason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </main>
  );
}
