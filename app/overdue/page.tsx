import { getSession } from "@/lib/session";
import { getOverdueTickets } from "@/lib/tickets/queries";
import TicketListTable from "@/components/TicketListTable";

export default async function OverduePage() {
  const session = await getSession();
  if (!session?.user) return null;
  const tickets = await getOverdueTickets(session.user.id, session.user.role);

  return (
    <main>
      <h1>Overdue</h1>
      <TicketListTable tickets={tickets} />
    </main>
  );
}
