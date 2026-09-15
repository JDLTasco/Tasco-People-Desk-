import { getSession } from "@/lib/session";
import { getClosedTickets } from "@/lib/tickets/queries";
import FilterableTicketList from "@/components/FilterableTicketList";

// History of every resolved ticket (status CLOSED/ARCHIVED), across all
// officers -- not §11's Archive Search (Stage 6, full-text over the
// archive artefacts themselves, which don't exist yet).
export default async function ClosedPage() {
  const session = await getSession();
  if (!session?.user) return null;
  const tickets = await getClosedTickets(session.user.id, session.user.role);

  return (
    <main>
      <h1>Closed</h1>
      <p>Every ticket that has been closed, most recently closed first.</p>
      <FilterableTicketList tickets={tickets} />
    </main>
  );
}
