import { getSession } from "@/lib/session";
import NewTicketForm from "./new-ticket-form";

// Operator addition (2026-09-16, not in the original v1.3 text -- see
// STATUS.md): any signed-in staff member can log a ticket that didn't
// arrive by email (phone call, walk-in). No role gate beyond being
// signed in at all -- same as self-claiming from the Pool.
export default async function NewTicketPage() {
  const session = await getSession();
  if (!session?.user) return null;

  return (
    <main>
      <h1>New ticket</h1>
      <p>
        Use this for a request that didn&apos;t arrive by email -- a phone call, a walk-in, anything that still
        needs to go through the same process. It&apos;s created unassigned in the Pool, exactly like a real inbound
        email, so claiming, category, and everything else after this works the same way.
      </p>
      <NewTicketForm />
    </main>
  );
}
