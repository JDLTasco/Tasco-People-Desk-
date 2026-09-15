import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Exempt from auth (§6) -- App Service / uptime checks hit this
// unauthenticated. Deliberately minimal: this is a liveness check, not a
// diagnostics endpoint, so it reports ok/degraded and nothing else.
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json({ status: "degraded" }, { status: 503 });
  }
}
