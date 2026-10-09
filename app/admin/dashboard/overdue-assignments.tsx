import Link from "next/link";
import { formatAuDateTime } from "@/lib/format-date";
import type { OverdueAssignment } from "@/lib/dashboard/assignment-overdue";

// Overdue to be assigned (John, 2026-10-10): Pool tickets past the
// 1-working-day assignment deadline, oldest first.

/** A deadline at Melbourne midnight (weekend/holiday arrivals) reads as "end of <that day>", not "12:00 am" the next day. */
function formatDeadline(iso: string): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Australia/Melbourne" });
  if (time !== "00:00" && time !== "24:00") return formatAuDateTime(d);
  const dayBefore = new Date(d.getTime() - 60 * 1000);
  return `end of ${dayBefore.toLocaleDateString("en-AU", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Australia/Melbourne" })}`;
}

export default function OverdueAssignments({ rows }: { rows: OverdueAssignment[] }) {
  if (rows.length === 0) {
    return <p className="text-muted">Every ticket in the Pool is within its 1 working day. Nothing overdue to be assigned.</p>;
  }
  return (
    <div className="table-scroll">
      <table className="terminations-table">
        <caption className="sr-only">Tickets overdue to be assigned</caption>
        <thead>
          <tr>
            <th>Ticket</th>
            <th>Subject</th>
            <th>From</th>
            <th>Priority</th>
            <th>Category</th>
            <th>Received</th>
            <th>Should have been assigned by</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id}>
              <td>
                <Link href={`/tickets/${t.id}`}>{t.ticketNo}</Link>
              </td>
              <td>
                <Link href={`/tickets/${t.id}`}>{t.subject}</Link> {t.isConfidential && <span title="Confidential">🔒</span>}
              </td>
              <td>{t.requesterName}</td>
              <td>{t.priority}</td>
              <td>{t.category ?? <em>none</em>}</td>
              <td>{formatAuDateTime(new Date(t.receivedAt))}</td>
              <td className="overdue">
                {formatDeadline(t.assignDueAt)} -- OVERDUE
                {t.workingDaysLate > 0 && ` by ${t.workingDaysLate} working day${t.workingDaysLate === 1 ? "" : "s"}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
