import { getSession } from "@/lib/session";
import { getMyTickets } from "@/lib/tickets/queries";
import FilterableTicketList from "@/components/FilterableTicketList";

export default async function MyTicketsPage() {
  const session = await getSession();
  if (!session?.user) return null;
  const tickets = await getMyTickets(session.user.id);

  return (
    <main>
      <h1>My tickets</h1>
      <FilterableTicketList tickets={tickets} />
    </main>
  );
}
