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
    <table className="ticket-list">
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
            <tr
              key={t.id}
              className={
                // Left edge colour follows priority (John, 2026-10-05; was the
                // assignee's colour, which still shows on the Assignee chip).
                [t.responseAlertPending ? "row-response-alert" : "", `priority-edge-${t.priority}`]
                  .filter(Boolean)
                  .join(" ") || undefined
              }
            >
              {/* data-label: the column name shown on phones, where each row is a card (2026-10-03). */}
              <td data-label="Ticket">
                <Link href={`/tickets/${t.id}`}>{t.ticketNo}</Link>
                {t.responseAlertPending && (
                  <span title="New response recorded -- not yet opened by the assignee"> 🔔</span>
                )}
              </td>
              <td data-label="Subject">
                {t.subject} {t.isConfidential && <span title="Confidential">🔒</span>}
              </td>
              <td data-label="Requester">{t.requesterName}</td>
              <td data-label="Status">
                <span className={`chip chip-status-${t.status}${t.actionStatus ? " chip-action-item" : ""}`}>{displayStatus(t)}</span>
              </td>
              <td data-label="Priority">
                <span className={`chip chip-priority-${t.priority}`}>{t.priority}</span>
              </td>
              <td data-label="Category">{t.category?.name ?? <em>none</em>}</td>
              <td data-label="Business unit">{t.businessUnit?.name ?? <em>none</em>}</td>
              <td data-label="Assignee">
                {/* A colour per staff member (2026-10-03) -- see lib/users/colours.ts. */}
                {t.assignee ? (
                  <span className={`chip chip-assignee assignee-colour-${t.assigneeColour ?? 0}`}>{t.assignee.displayName}</span>
                ) : (
                  <em>unassigned</em>
                )}
              </td>
              <td data-label="Due" className={overdue ? "overdue" : undefined}>
                {formatAuDateTime(due)} {overdue && "-- OVERDUE"}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
