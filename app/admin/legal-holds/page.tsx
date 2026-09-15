import Link from "next/link";
import { getSession } from "@/lib/session";
import { canViewAuditLog } from "@/lib/rbac";
import { getLegalHoldTickets } from "@/lib/tickets/queries";

const TWELVE_MONTHS_MS = 365 * 24 * 60 * 60 * 1000;

// §10 "Admin legal holds view": every ticket with an active hold, oldest
// first, "flags holds over 12 months old for review" -- "a hold nobody
// reviews becomes indefinite retention of personal data." Read-only:
// setting/clearing a hold happens on the ticket detail page itself
// (step-up + mandatory reason), not from this list.
export default async function LegalHoldsPage() {
  const session = await getSession();
  if (!session?.user) return null;
  if (!canViewAuditLog(session.user.role)) {
    return (
      <main>
        <h1>Not permitted</h1>
        <p>Only ADMIN or HR_LEAD can view legal holds.</p>
      </main>
    );
  }

  const holds = await getLegalHoldTickets();
  const now = Date.now();

  return (
    <main>
      <h1>Admin -- Legal holds</h1>
      {holds.length === 0 && <p>No active legal holds.</p>}
      {holds.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Ticket</th>
              <th>Reason</th>
              <th>Set by</th>
              <th>Set at</th>
              <th>Age</th>
            </tr>
          </thead>
          <tbody>
            {holds.map((h) => {
              const ageMs = h.legalHoldSetAt ? now - h.legalHoldSetAt.getTime() : 0;
              const overdue = ageMs > TWELVE_MONTHS_MS;
              return (
                <tr key={h.id} className={overdue ? "overdue" : undefined}>
                  <td>
                    <Link href={`/tickets/${h.id}`}>
                      {h.ticketNo} -- {h.subject}
                    </Link>
                  </td>
                  <td>{h.legalHoldReason}</td>
                  <td>{h.legalHoldSetBy?.displayName ?? "(unknown)"}</td>
                  <td>{h.legalHoldSetAt?.toLocaleString() ?? "(unknown)"}</td>
                  <td>{overdue ? "OVER 12 MONTHS -- REVIEW" : `${Math.floor(ageMs / (24 * 60 * 60 * 1000))} days`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </main>
  );
}
