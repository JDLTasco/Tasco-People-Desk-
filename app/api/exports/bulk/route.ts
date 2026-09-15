import { prisma } from "@/lib/prisma";
import { requireApiContext } from "@/lib/api-context";
import { badRequest, forbidden } from "@/lib/http-errors";
import { canBulkExport } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";
import { isOverdue } from "@/lib/tickets/due-dates";

function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// §11 "Bulk (ADMIN / HR_LEAD)": "CSV of ticket metadata over a date
// range, including category, business unit, priority, both due dates,
// overdue flag, assignee, first-view and closure timestamps.
// Confidential tickets excluded unless ADMIN. Every bulk export is
// audit-logged with the filter criteria used."
export async function GET(request: Request) {
  const ctx = await requireApiContext(request);
  if (ctx instanceof Response) return ctx;
  const { session, correlationId } = ctx;

  if (!canBulkExport(session.user.role)) {
    return forbidden("Only ADMIN or HR_LEAD may run a bulk export");
  }

  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (!from || !to) return badRequest("from and to (YYYY-MM-DD) are both required");

  const tickets = await prisma.ticket.findMany({
    where: {
      isDeleted: false,
      requestDate: { gte: new Date(from), lte: new Date(to) },
      ...(session.user.role === "ADMIN" ? {} : { isConfidential: false }),
    },
    include: {
      category: { select: { name: true } },
      businessUnit: { select: { name: true } },
      assignee: { select: { displayName: true } },
      firstViewedBy: { select: { displayName: true } },
    },
    orderBy: { requestDate: "asc" },
  });

  const header = [
    "ticket_no",
    "subject",
    "category",
    "business_unit",
    "priority",
    "status",
    "sla_due_at",
    "target_due_at",
    "overdue",
    "assignee",
    "first_viewed_at",
    "first_viewed_by",
    "closed_at",
  ];
  const rows = tickets.map((t) =>
    [
      t.ticketNo,
      t.subject,
      t.category?.name ?? "",
      t.businessUnit?.name ?? "",
      t.priority,
      t.status,
      t.slaDueAt.toISOString(),
      t.targetDueAt?.toISOString() ?? "",
      isOverdue(t.slaDueAt, t.targetDueAt, t.status),
      t.assignee?.displayName ?? "",
      t.firstViewedAt?.toISOString() ?? "",
      t.firstViewedBy?.displayName ?? "",
      t.closedAt?.toISOString() ?? "",
    ]
      .map(csvCell)
      .join(","),
  );
  const csv = [header.join(","), ...rows].join("\n");

  await writeAuditLog({
    correlationId,
    actorId: session.user.id,
    action: "BULK_EXPORT",
    entity: "ticket",
    entityId: "bulk",
    afterJson: { from, to, role: session.user.role, rowCount: tickets.length },
  });

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="tickets_${from}_${to}.csv"`,
    },
  });
}
