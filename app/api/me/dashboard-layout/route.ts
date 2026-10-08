import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { badRequest, unauthorized } from "@/lib/http-errors";
import { parseDashboardLayout } from "@/lib/dashboard/layout";

// The signed-in staff member's own dashboard arrangement (John, 2026-10-08).
// Any role, own row only; a display preference, so not audited (same as the
// list column layout in /api/me/list-layout). The dashboard page reads it
// server-side, so there is no GET.

/** Body: { layout: { order, hidden, sizes } } to save, or { layout: null } for the standard dashboard. */
export async function PUT(request: Request) {
  const session = await getSession();
  if (!session?.user) return unauthorized();
  const body = (await request.json().catch(() => null)) as { layout?: unknown } | null;
  if (!body || !("layout" in body)) return badRequest("layout is required");
  const layout = body.layout === null ? null : parseDashboardLayout(body.layout);
  if (body.layout !== null && !layout) return badRequest("Not a valid dashboard layout");

  await prisma.user.update({
    where: { id: session.user.id },
    data: { dashboardLayout: layout ? (layout as unknown as Prisma.InputJsonObject) : Prisma.DbNull },
  });
  return NextResponse.json({ layout });
}
