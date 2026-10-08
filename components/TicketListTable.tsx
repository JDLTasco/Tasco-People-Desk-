"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { effectiveDueDate, isOverdue } from "@/lib/tickets/due-dates";
import { formatAuDateTime } from "@/lib/format-date";
import type { TicketListRow } from "@/lib/tickets/queries";
import { displayStatus } from "@/lib/tickets/action-status";

const COLUMNS = [
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
] as const;

// Column widths the viewer has dragged (John, 2026-10-08): percentages of the
// table width, kept in this browser only and shared by every list using this
// table. Nothing saved = the browser's own automatic widths, as before.
const WIDTHS_KEY = "ticket-list-col-widths-v1";
const MIN_COL_PX = 40;

function loadWidths(): number[] | null {
  try {
    const raw = localStorage.getItem(WIDTHS_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      Array.isArray(parsed) &&
      parsed.length === COLUMNS.length &&
      parsed.every((n) => typeof n === "number" && Number.isFinite(n) && n > 0)
    ) {
      return parsed as number[];
    }
  } catch {
    // unavailable or corrupt -- fall back to automatic widths
  }
  return null;
}

function saveWidths(widths: number[] | null) {
  try {
    if (widths) localStorage.setItem(WIDTHS_KEY, JSON.stringify(widths));
    else localStorage.removeItem(WIDTHS_KEY);
  } catch {
    // not saved; widths still apply until the page is left
  }
}

export default function TicketListTable({ tickets }: { tickets: TicketListRow[] }) {
  const tableRef = useRef<HTMLTableElement>(null);
  const [widths, setWidths] = useState<number[] | null>(null);
  const widthsRef = useRef<number[] | null>(null);
  widthsRef.current = widths;

  useEffect(() => {
    setWidths(loadWidths());
  }, []);

  // Dragging the edge between column i and i+1: column i follows the cursor,
  // and the columns to its right share the difference in proportion to their
  // size, so the table keeps its width and the columns to the left stay put.
  function startResize(i: number, e: React.PointerEvent<HTMLSpanElement>) {
    const table = tableRef.current;
    if (!table) return;
    e.preventDefault();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const tableWidth = table.getBoundingClientRect().width;
    const startPx = Array.from(table.querySelectorAll("thead th")).map((th) => th.getBoundingClientRect().width);
    const startX = e.clientX;
    const rightTotal = startPx.slice(i + 1).reduce((a, b) => a + b, 0);
    const rightCount = startPx.length - i - 1;
    const minDx = MIN_COL_PX - startPx[i];
    const maxDx = rightTotal - MIN_COL_PX * rightCount;
    document.body.classList.add("col-resizing");

    const onMove = (ev: PointerEvent) => {
      const dx = Math.min(maxDx, Math.max(minDx, ev.clientX - startX));
      const px = startPx.map((w, j) => {
        if (j < i) return w;
        if (j === i) return w + dx;
        return Math.max(MIN_COL_PX, w * ((rightTotal - dx) / rightTotal));
      });
      const sum = px.reduce((a, b) => a + b, 0) || tableWidth;
      setWidths(px.map((w) => (w / sum) * 100));
    };
    const onUp = () => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onUp);
      document.body.classList.remove("col-resizing");
      saveWidths(widthsRef.current);
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onUp);
  }

  function resetWidths() {
    setWidths(null);
    saveWidths(null);
  }

  if (tickets.length === 0) {
    return <p>No tickets here.</p>;
  }

  return (
    <>
      {widths && (
        <div className="col-reset">
          <button type="button" className="secondary" onClick={resetWidths}>
            Reset column widths
          </button>
        </div>
      )}
      <table ref={tableRef} className={`ticket-list${widths ? " ticket-list-fixed" : ""}`}>
        {widths && (
          <colgroup>
            {widths.map((w, i) => (
              <col key={COLUMNS[i]} style={{ width: `${w}%` }} />
            ))}
          </colgroup>
        )}
        <thead>
          <tr>
            {COLUMNS.map((name, i) => (
              <th key={name} title={name}>
                {name}
                {i < COLUMNS.length - 1 && (
                  <span
                    className="col-resize-handle"
                    title="Drag to resize -- double-click to reset all columns"
                    onPointerDown={(e) => startResize(i, e)}
                    onDoubleClick={resetWidths}
                  />
                )}
              </th>
            ))}
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
                {/* When the email arrived, or when a + New ticket was logged (John, 2026-10-05). */}
                <td data-label="Received">{formatAuDateTime(t.receivedAt)}</td>
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
    </>
  );
}
