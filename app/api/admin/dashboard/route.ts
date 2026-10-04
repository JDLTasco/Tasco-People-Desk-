import { NextResponse } from "next/server";
import { requireApiContext } from "@/lib/api-context";
import { forbidden } from "@/lib/http-errors";
import { canViewDashboard } from "@/lib/rbac";
import { loadDashboard } from "@/lib/dashboard/load";
import { isTrendRange } from "@/lib/dashboard/metrics";

// HR Management Dashboard data (John, 2026-10-03) -- ADMIN / HR_LEAD.
// ?range=7d|30d|90d|12m (default 30d) selects the trend window, which also
// scopes resolution time and compliance.
export async function GET(request: Request) {
  const ctx = await requireApiContext(request);
  if (ctx instanceof Response) return ctx;
  const { session } = ctx;
  if (!canViewDashboard(session.user.role)) return forbidden("You don't have access to the dashboard");

  const param = new URL(request.url).searchParams.get("range");
  const range = isTrendRange(param) ? param : "30d";
  return NextResponse.json(await loadDashboard(session.user.id, session.user.role, range));
}
