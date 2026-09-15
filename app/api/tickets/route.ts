import { NextResponse } from "next/server";
import { requireApiContext } from "@/lib/api-context";
import { badRequest } from "@/lib/http-errors";
import {
  getAllOpenTickets,
  getClosedTickets,
  getMyTickets,
  getOverdueTickets,
  getPoolTickets,
} from "@/lib/tickets/queries";

// §13's list views. "view" defaults to pool, the spec's own default landing view.
export async function GET(request: Request) {
  const ctx = await requireApiContext(request);
  if (ctx instanceof Response) return ctx;
  const { session } = ctx;

  const view = new URL(request.url).searchParams.get("view") ?? "pool";

  switch (view) {
    case "pool":
      return NextResponse.json({ tickets: await getPoolTickets(session.user.id, session.user.role) });
    case "mine":
      return NextResponse.json({ tickets: await getMyTickets(session.user.id) });
    case "open":
      return NextResponse.json({ tickets: await getAllOpenTickets(session.user.id, session.user.role) });
    case "overdue":
      return NextResponse.json({ tickets: await getOverdueTickets(session.user.id, session.user.role) });
    case "closed":
      return NextResponse.json({ tickets: await getClosedTickets(session.user.id, session.user.role) });
    default:
      return badRequest(`Unknown view: ${view} (expected pool, mine, open, overdue, or closed)`);
  }
}
