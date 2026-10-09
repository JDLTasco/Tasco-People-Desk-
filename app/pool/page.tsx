import Link from "next/link";
import { getSession } from "@/lib/session";
import { getPoolTickets } from "@/lib/tickets/queries";
import { loadOverdueAssignments } from "@/lib/dashboard/assignment-overdue";
import FilterableTicketList from "@/components/FilterableTicketList";

export default async function PoolPage() {
  const session = await getSession();
  if (!session?.user) return null; // middleware already guarantees this; satisfies TS
  const [tickets, overdue] = await Promise.all([
    getPoolTickets(session.user.id, session.user.role),
    loadOverdueAssignments(session.user.id, session.user.role),
  ]);

  return (
    <main>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h1>Pool</h1>
        <Link href="/tickets/new">
          <button type="button">+ New ticket</button>
        </Link>
      </div>
      <p>Unassigned tickets, available for anyone to self-assign.</p>
      {/* Assignment KPI (John, 2026-10-10): claim or assign within 1 working day. */}
      {overdue.length > 0 && (
        <p role="alert" className="banner banner-error">
          ⚠ {overdue.length} ticket{overdue.length === 1 ? " has" : "s have"} been in the Pool for more than 1 working day
          and {overdue.length === 1 ? "is" : "are"} overdue to be claimed or assigned:{" "}
          {overdue.slice(0, 10).map((t, i) => (
            <span key={t.id}>
              {i > 0 && ", "}
              <Link href={`/tickets/${t.id}`}>{t.ticketNo}</Link>
            </span>
          ))}
          {overdue.length > 10 ? ` and ${overdue.length - 10} more` : ""}. The oldest are at the top of the list below.
        </p>
      )}
      <FilterableTicketList tickets={tickets} />
    </main>
  );
}
