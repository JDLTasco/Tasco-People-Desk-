import { NextResponse } from "next/server";
import { requireApiContext } from "@/lib/api-context";
import { badRequest, forbidden } from "@/lib/http-errors";
import { canViewDashboard } from "@/lib/rbac";
import { loadDashboard } from "@/lib/dashboard/load";
import { resolvePeriod } from "@/lib/dashboard/period";

// HR Management Dashboard data (John, 2026-10-03) -- ADMIN / HR_LEAD.
// ?range=7d|30d|90d|12m|lastMonth|thisQuarter|lastQuarter (default 30d), or
// ?from=YYYY-MM-DD&to=YYYY-MM-DD (2026-10-08), selects the reporting period,
// which scopes trends, resolution time and compliance.
export async function GET(request: Request) {
  const ctx = await requireApiContext(request);
  if (ctx instanceof Response) return ctx;
  const { session } = ctx;
  if (!canViewDashboard(session.user.role)) return forbidden("You don't have access to the dashboard");

  const params = new URL(request.url).searchParams;
  const { period, error } = resolvePeriod(
    { range: params.get("range") ?? undefined, from: params.get("from") ?? undefined, to: params.get("to") ?? undefined },
    new Date(),
  );
  if (error) return badRequest(error);
  return NextResponse.json(await loadDashboard(session.user.id, session.user.role, period));
}
