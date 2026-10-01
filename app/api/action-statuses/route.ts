import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiContext } from "@/lib/api-context";

// Read-only list of active action items for the ticket page's Action
// section (operator addition, John 2026-10-01).
export async function GET(request: Request) {
  const ctx = await requireApiContext(request);
  if (ctx instanceof Response) return ctx;

  const actionStatuses = await prisma.actionStatus.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true },
  });
  return NextResponse.json({ actionStatuses });
}
