import Link from "next/link";
import { getSession } from "@/lib/session";
import { getPoolTickets } from "@/lib/tickets/queries";
import FilterableTicketList from "@/components/FilterableTicketList";

export default async function PoolPage() {
  const session = await getSession();
  if (!session?.user) return null; // middleware already guarantees this; satisfies TS
  const tickets = await getPoolTickets(session.user.id, session.user.role);

  return (
    <main>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h1>Pool</h1>
        <Link href="/tickets/new">
          <button type="button">+ New ticket</button>
        </Link>
      </div>
      <p>Unassigned tickets, available for anyone to self-assign.</p>
      <FilterableTicketList tickets={tickets} />
    </main>
  );
}
