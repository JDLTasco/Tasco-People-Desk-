import { NextResponse } from "next/server";
import { requireApiContext } from "@/lib/api-context";
import { searchArchive } from "@/lib/tickets/queries";

export async function GET(request: Request) {
  const ctx = await requireApiContext(request);
  if (ctx instanceof Response) return ctx;
  const { session } = ctx;

  const p = new URL(request.url).searchParams;
  const tickets = await searchArchive(session.user.id, session.user.role, {
    ticketNo: p.get("ticketNo") ?? undefined,
    requester: p.get("requester") ?? undefined,
    subject: p.get("subject") ?? undefined,
    categoryId: p.get("categoryId") ?? undefined,
    businessUnitId: p.get("businessUnitId") ?? undefined,
    assigneeId: p.get("assigneeId") ?? undefined,
    from: p.get("from") ?? undefined,
    to: p.get("to") ?? undefined,
    legalHold: p.has("legalHold") ? p.get("legalHold") === "true" : undefined,
    includeNotARequest: p.get("includeNotARequest") === "true",
  });
  return NextResponse.json({ tickets });
}
