import { getSession } from "@/lib/session";
import { getAllOpenTickets } from "@/lib/tickets/queries";
import FilterableTicketList from "@/components/FilterableTicketList";

export default async function AllOpenPage() {
  const session = await getSession();
  if (!session?.user) return null;
  const tickets = await getAllOpenTickets(session.user.id, session.user.role);

  return (
    <main>
      <h1>All open</h1>
      <FilterableTicketList tickets={tickets} />
    </main>
  );
}
