import { getSession } from "@/lib/session";
import { getPoolTickets } from "@/lib/tickets/queries";
import TicketListTable from "@/components/TicketListTable";

export default async function PoolPage() {
  const session = await getSession();
  if (!session?.user) return null; // middleware already guarantees this; satisfies TS
  const tickets = await getPoolTickets(session.user.id, session.user.role);

  return (
    <main>
      <h1>Pool</h1>
      <p>Unassigned tickets, available for anyone to self-assign.</p>
      <TicketListTable tickets={tickets} />
    </main>
  );
}
