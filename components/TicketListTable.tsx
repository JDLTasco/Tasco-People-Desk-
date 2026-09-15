import Link from "next/link";
import { effectiveDueDate, isOverdue } from "@/lib/tickets/due-dates";
import type { TicketListRow } from "@/lib/tickets/queries";

export default function TicketListTable({ tickets }: { tickets: TicketListRow[] }) {
  if (tickets.length === 0) {
    return <p>No tickets here.</p>;
  }

  return (
    <table style={{ borderCollapse: "collapse", width: "100%" }}>
      <thead>
        <tr style={{ textAlign: "left", borderBottom: "2px solid #333" }}>
          <th>Ticket</th>
          <th>Subject</th>
          <th>Requester</th>
          <th>Status</th>
          <th>Priority</th>
          <th>Category</th>
          <th>Business unit</th>
          <th>Assignee</th>
          <th>Due</th>
        </tr>
      </thead>
      <tbody>
        {tickets.map((t) => {
          const due = effectiveDueDate(t.slaDueAt, t.targetDueAt);
          const overdue = isOverdue(t.slaDueAt, t.targetDueAt, t.status);
          return (
            <tr key={t.id} style={{ borderBottom: "1px solid #ddd" }}>
              <td>
                <Link href={`/tickets/${t.id}`}>{t.ticketNo}</Link>
              </td>
              <td>
                {t.subject} {t.isConfidential && <span title="Confidential">🔒</span>}
              </td>
              <td>{t.requesterName}</td>
              <td>{t.status}</td>
              <td>{t.priority}</td>
              <td>{t.category?.name ?? <em>none</em>}</td>
              <td>{t.businessUnit?.name ?? <em>none</em>}</td>
              <td>{t.assignee ? `${t.assignee.displayName} (${t.assignee.initials})` : <em>unassigned</em>}</td>
              <td style={overdue ? { color: "#b00020", fontWeight: "bold" } : undefined}>
                {due.toLocaleString()} {overdue && "-- OVERDUE"}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
