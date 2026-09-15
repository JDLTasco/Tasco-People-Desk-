import { getSession } from "@/lib/session";
import { getOverdueTickets } from "@/lib/tickets/queries";
import FilterableTicketList from "@/components/FilterableTicketList";

export default async function OverduePage() {
  const session = await getSession();
  if (!session?.user) return null;
  const tickets = await getOverdueTickets(session.user.id, session.user.role);

  return (
    <main>
      <h1>Overdue</h1>
      <FilterableTicketList tickets={tickets} />
    </main>
  );
}
