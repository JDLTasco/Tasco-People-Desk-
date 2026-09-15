import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiContext } from "@/lib/api-context";

// Minimal active-user list -- needed by the assign/reassign picker in the
// ticket detail UI (Stage 3). Full user management is Stage 6's Admin
// screen; this is deliberately read-only and unfiltered by role since
// every role can see who else exists to assign/reassign to.
export async function GET(request: Request) {
  const ctx = await requireApiContext(request);
  if (ctx instanceof Response) return ctx;

  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, displayName: true, initials: true, role: true },
    orderBy: { displayName: "asc" },
  });
  return NextResponse.json({ users });
}
