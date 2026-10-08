import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { badRequest, unauthorized } from "@/lib/http-errors";
import { parseListLayout } from "@/lib/tickets/list-layout";

// The signed-in staff member's own ticket list column layout (John,
// 2026-10-08). Any role, own row only; a display preference, so not audited
// (same as the light/dark choice).
export async function GET() {
  const session = await getSession();
  if (!session?.user) return unauthorized();
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { ticketListLayout: true },
  });
  return NextResponse.json({ layout: parseListLayout(user?.ticketListLayout ?? null) });
}

/** Body: { layout: { order, widths } } to save, or { layout: null } to go back to the default. */
export async function PUT(request: Request) {
  const session = await getSession();
  if (!session?.user) return unauthorized();
  const body = (await request.json().catch(() => null)) as { layout?: unknown } | null;
  if (!body || !("layout" in body)) return badRequest("layout is required");
  const layout = body.layout === null ? null : parseListLayout(body.layout);
  if (body.layout !== null && !layout) return badRequest("Not a valid column layout");

  await prisma.user.update({
    where: { id: session.user.id },
    data: { ticketListLayout: layout ?? Prisma.DbNull },
  });
  return NextResponse.json({ layout });
}
