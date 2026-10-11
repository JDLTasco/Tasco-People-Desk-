import { requireApiContext } from "@/lib/api-context";
import { badRequest } from "@/lib/http-errors";
import { writeAuditLog } from "@/lib/audit";

const VIEWS = new Set(["Pool", "My tickets", "All open", "Overdue", "Closed"]);

// Export CSV on the ticket lists (John, 2026-10-11): any signed-in staff
// member may export the list they are looking at -- only tickets they can
// already see, so no new access. The browser builds the file from the
// on-screen rows (lib/tickets/list-csv.ts) and only hands it over once this
// audit record has been written, same rule as §11's bulk export.
export async function POST(request: Request) {
  const ctx = await requireApiContext(request);
  if (ctx instanceof Response) return ctx;
  const { session, correlationId } = ctx;

  const body = (await request.json().catch(() => null)) as { view?: unknown; rowCount?: unknown; filters?: unknown } | null;
  const view = typeof body?.view === "string" ? body.view : "";
  const rowCount = typeof body?.rowCount === "number" ? body.rowCount : -1;
  if (!VIEWS.has(view) || rowCount < 0) return badRequest("view and rowCount are required");
  const filters = typeof body?.filters === "string" ? body.filters.slice(0, 2000) : "";

  await writeAuditLog({
    correlationId,
    actorId: session.user.id,
    action: "LIST_EXPORTED",
    entity: "ticket",
    entityId: "list",
    afterJson: { view, rowCount, filters, role: session.user.role },
  });

  return new Response(null, { status: 204 });
}
