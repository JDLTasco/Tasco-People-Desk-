"use client";

import { useState } from "react";
import Link from "next/link";
import { formatAuDateTime } from "@/lib/format-date";
import { formatTerminationDate } from "@/lib/tickets/terminations";
import type { UpcomingTermination } from "@/lib/dashboard/terminations";

// Upcoming Terminations (John, 2026-10-08): open Terminations/Resignations
// tickets, sorted by termination date -- soonest first by default; click the
// heading to flip. Tickets with no date yet always go last.
export default function UpcomingTerminations({ rows }: { rows: UpcomingTermination[] }) {
  const [direction, setDirection] = useState<"asc" | "desc">("asc");

  if (rows.length === 0) {
    return <p className="text-muted">No open Terminations/Resignations tickets.</p>;
  }

  const sorted = rows.slice().sort((a, b) => {
    if (!a.terminationDate || !b.terminationDate) {
      if (a.terminationDate) return -1;
      if (b.terminationDate) return 1;
      return a.ticketNo.localeCompare(b.ticketNo);
    }
    const cmp = a.terminationDate.localeCompare(b.terminationDate) || a.ticketNo.localeCompare(b.ticketNo);
    return direction === "asc" ? cmp : -cmp;
  });

  return (
    <div className="table-scroll">
      <table className="terminations-table">
        <caption className="sr-only">Upcoming terminations</caption>
        <thead>
          <tr>
            <th aria-sort={direction === "asc" ? "ascending" : "descending"}>
              <button
                type="button"
                className="th-sort"
                onClick={() => setDirection(direction === "asc" ? "desc" : "asc")}
                title="Click to reverse the order"
              >
                Termination date {direction === "asc" ? "▲" : "▼"}
              </button>
            </th>
            <th>Ticket</th>
            <th>Subject</th>
            <th>Business unit</th>
            <th>Assignee</th>
            <th>Due</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((t) => (
            <tr key={t.id}>
              <td>{t.terminationDate ? formatTerminationDate(t.terminationDate) : <em>not set</em>}</td>
              <td>
                <Link href={`/tickets/${t.id}`}>{t.ticketNo}</Link>
              </td>
              <td>
                <Link href={`/tickets/${t.id}`}>{t.subject}</Link> {t.isConfidential && <span title="Confidential">🔒</span>}
              </td>
              <td>{t.businessUnit ?? <em>none</em>}</td>
              <td>
                {t.assignee ? (
                  <span className={`chip chip-assignee assignee-colour-${t.assigneeColour ?? 0}`}>{t.assignee}</span>
                ) : (
                  <em>unassigned</em>
                )}
              </td>
              <td className={t.overdue ? "overdue" : undefined}>
                {formatAuDateTime(new Date(t.dueAt))} {t.overdue && "-- OVERDUE"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
