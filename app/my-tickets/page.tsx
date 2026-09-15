import { getSession } from "@/lib/session";
import { getMyTickets } from "@/lib/tickets/queries";
import TicketListTable from "@/components/TicketListTable";

export default async function MyTicketsPage() {
  const session = await getSession();
  if (!session?.user) return null;
  const tickets = await getMyTickets(session.user.id);

  return (
    <main>
      <h1>My tickets</h1>
      <TicketListTable tickets={tickets} />
    </main>
  );
}
