import { effectiveDueDate, isOverdue } from "./due-dates";
import { displayStatus } from "./action-status";
import { formatAuDateTime } from "../format-date";
import type { TicketListRow } from "./queries";

// CSV of a ticket list exactly as filtered and sorted on screen (John,
// 2026-10-11) -- Pool, My tickets, All open, Overdue and Closed. Any staff
// member may export what they can already see; every export is audit-logged
// (POST /api/exports/list) before the file is handed over.

/** Quotes a cell when needed, and defuses spreadsheet formulas (a subject starting "=" etc. from an outside email). */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const HEADER = [
  "Ticket",
  "Received",
  "Subject",
  "Requester",
  "Status",
  "Priority",
  "Category",
  "Business unit",
  "Assignee",
  "Due",
  "Overdue",
  "Confidential",
];

export function ticketListCsv(tickets: TicketListRow[]): string {
  const rows = tickets.map((t) =>
    [
      t.ticketNo,
      formatAuDateTime(t.receivedAt),
      t.subject,
      t.requesterName,
      displayStatus(t),
      t.priority,
      t.category?.name ?? "",
      t.businessUnit?.name ?? "",
      t.assignee?.displayName ?? "",
      formatAuDateTime(effectiveDueDate(t.slaDueAt, t.targetDueAt)),
      isOverdue(t.slaDueAt, t.targetDueAt, t.status) ? "Yes" : "No",
      t.isConfidential ? "Yes" : "No",
    ]
      .map(csvCell)
      .join(","),
  );
  // Leading BOM so Excel opens it as UTF-8 (names with accents, dashes in subjects).
  return "﻿" + [HEADER.join(","), ...rows].join("\r\n") + "\r\n";
}
