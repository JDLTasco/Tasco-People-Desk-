import { NextResponse } from "next/server";
import { requireApiContext } from "@/lib/api-context";
import { searchTickets } from "@/lib/tickets/queries";

// Added directly with John, Sep 2026, for the ticket-merge picker: find a
// candidate ticket by number or subject text. Confidentiality-scoped the
// same way every other list view already is (lib/tickets/queries.ts's own
// confidentialFilter()) -- never a way to discover a confidential ticket
// a caller couldn't otherwise see.
export async function GET(request: Request) {
  const ctx = await requireApiContext(request);
  if (ctx instanceof Response) return ctx;
  const { session } = ctx;

  const q = new URL(request.url).searchParams.get("q") ?? "";
  const tickets = await searchTickets(session.user.id, session.user.role, q);
  return NextResponse.json({ tickets });
}
