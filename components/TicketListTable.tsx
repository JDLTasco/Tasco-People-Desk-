import Link from "next/link";
import { effectiveDueDate, isOverdue } from "@/lib/tickets/due-dates";
import { formatAuDateTime } from "@/lib/format-date";
import type { TicketListRow } from "@/lib/tickets/queries";
import { displayStatus } from "@/lib/tickets/action-status";

export default function TicketListTable({ tickets }: { tickets: TicketListRow[] }) {
  if (tickets.length === 0) {
    return <p>No tickets here.</p>;
  }

  return (
    <table>
      <thead>
        <tr>
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
            <tr key={t.id} className={t.responseAlertPending ? "row-response-alert" : undefined}>
              <td>
                <Link href={`/tickets/${t.id}`}>{t.ticketNo}</Link>
                {t.responseAlertPending && (
                  <span title="New response recorded -- not yet opened by the assignee"> 🔔</span>
                )}
              </td>
              <td>
                {t.subject} {t.isConfidential && <span title="Confidential">🔒</span>}
              </td>
              <td>{t.requesterName}</td>
              <td>
                <span className={`chip chip-status-${t.status}${t.actionStatus ? " chip-action-item" : ""}`}>{displayStatus(t)}</span>
              </td>
              <td>
                <span className={`chip chip-priority-${t.priority}`}>{t.priority}</span>
              </td>
              <td>{t.category?.name ?? <em>none</em>}</td>
              <td>{t.businessUnit?.name ?? <em>none</em>}</td>
              <td>{t.assignee ? t.assignee.displayName : <em>unassigned</em>}</td>
              <td className={overdue ? "overdue" : undefined}>
                {formatAuDateTime(due)} {overdue && "-- OVERDUE"}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
