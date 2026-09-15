import { getSession } from "@/lib/session";
import { getPoolTickets } from "@/lib/tickets/queries";
import FilterableTicketList from "@/components/FilterableTicketList";

export default async function PoolPage() {
  const session = await getSession();
  if (!session?.user) return null; // middleware already guarantees this; satisfies TS
  const tickets = await getPoolTickets(session.user.id, session.user.role);

  return (
    <main>
      <h1>Pool</h1>
      <p>Unassigned tickets, available for anyone to self-assign.</p>
      <FilterableTicketList tickets={tickets} />
    </main>
  );
}
