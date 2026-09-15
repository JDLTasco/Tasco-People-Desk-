import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiContext } from "@/lib/api-context";

// Read-only list for the ticket detail business-unit selector (Stage 3).
// The admin CRUD screen for business units is Stage 6.
export async function GET(request: Request) {
  const ctx = await requireApiContext(request);
  if (ctx instanceof Response) return ctx;

  const businessUnits = await prisma.businessUnit.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });
  return NextResponse.json({ businessUnits });
}
