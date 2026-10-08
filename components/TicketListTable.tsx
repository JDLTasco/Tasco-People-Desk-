"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { effectiveDueDate, isOverdue } from "@/lib/tickets/due-dates";
import { formatAuDateTime } from "@/lib/format-date";
import type { TicketListRow } from "@/lib/tickets/queries";
import { displayStatus } from "@/lib/tickets/action-status";
import { parseListLayout, type ListColumnId, type ListLayout } from "@/lib/tickets/list-layout";

type Column = {
  id: ListColumnId;
  label: string;
  cell: (t: TicketListRow) => ReactNode;
  className?: (t: TicketListRow) => string | undefined;
};

const COLUMNS: Column[] = [
  {
    id: "ticket",
    label: "Ticket",
    cell: (t) => (
      <>
        <Link href={`/tickets/${t.id}`}>{t.ticketNo}</Link>
        {t.responseAlertPending && <span title="New response recorded -- not yet opened by the assignee"> 🔔</span>}
      </>
    ),
  },
  // When the email arrived, or when a + New ticket was logged (John, 2026-10-05).
  { id: "received", label: "Received", cell: (t) => formatAuDateTime(t.receivedAt) },
  {
    id: "subject",
    label: "Subject",
    cell: (t) => (
      <>
        {t.subject} {t.isConfidential && <span title="Confidential">🔒</span>}
      </>
    ),
  },
  { id: "requester", label: "Requester", cell: (t) => t.requesterName },
  {
    id: "status",
    label: "Status",
    cell: (t) => (
      <span className={`chip chip-status-${t.status}${t.actionStatus ? " chip-action-item" : ""}`}>{displayStatus(t)}</span>
    ),
  },
  { id: "priority", label: "Priority", cell: (t) => <span className={`chip chip-priority-${t.priority}`}>{t.priority}</span> },
  { id: "category", label: "Category", cell: (t) => t.category?.name ?? <em>none</em> },
  { id: "businessUnit", label: "Business unit", cell: (t) => t.businessUnit?.name ?? <em>none</em> },
  {
    id: "assignee",
    label: "Assignee",
    // A colour per staff member (2026-10-03) -- see lib/users/colours.ts.
    cell: (t) =>
      t.assignee ? (
        <span className={`chip chip-assignee assignee-colour-${t.assigneeColour ?? 0}`}>{t.assignee.displayName}</span>
      ) : (
        <em>unassigned</em>
      ),
  },
  {
    id: "due",
    label: "Due",
    cell: (t) => {
      const overdue = isOverdue(t.slaDueAt, t.targetDueAt, t.status);
      return (
        <>
          {formatAuDateTime(effectiveDueDate(t.slaDueAt, t.targetDueAt))} {overdue && "-- OVERDUE"}
        </>
      );
    },
    className: (t) => (isOverdue(t.slaDueAt, t.targetDueAt, t.status) ? "overdue" : undefined),
  },
];
const DEFAULT_ORDER = COLUMNS.map((c) => c.id);
const COLUMN_BY_ID = new Map(COLUMNS.map((c) => [c.id, c]));

// Column order and widths each staff member drags (John, 2026-10-08), saved on
// their own account (see lib/tickets/list-layout.ts) and shared by every list
// using this table. Kept in memory after the first load, so moving between
// lists doesn't flash the default layout.
type Layout = ListLayout;
const MIN_COL_PX = 40;
let cachedLayout: Layout | null | undefined;

// v2.4.0 kept widths in the browser only; carried over once to the account.
const OLD_WIDTHS_KEY = "ticket-list-col-widths-v1";
function takeOldBrowserWidths(): Layout | null {
  try {
    const old = JSON.parse(localStorage.getItem(OLD_WIDTHS_KEY) ?? "null");
    localStorage.removeItem(OLD_WIDTHS_KEY);
    return parseListLayout({ order: DEFAULT_ORDER, widths: old });
  } catch {
    return null;
  }
}

function saveLayout(layout: Layout | null) {
  cachedLayout = layout;
  void fetch("/api/me/list-layout", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ layout }),
  }).catch(() => {
    // not saved; the layout still applies until the page is reloaded
  });
}

export default function TicketListTable({ tickets }: { tickets: TicketListRow[] }) {
  const tableRef = useRef<HTMLTableElement>(null);
  const [layout, setLayout] = useState<Layout | null>(cachedLayout ?? null);
  const layoutRef = useRef<Layout | null>(null);
  layoutRef.current = layout;
  // While a heading is being dragged: where it came from, and the gap (0..n) it would drop into.
  const [move, setMove] = useState<{ from: number; to: number } | null>(null);

  useEffect(() => {
    if (cachedLayout !== undefined) return;
    let cancelled = false;
    fetch("/api/me/list-layout")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { layout: Layout | null } | null) => {
        if (!data || cancelled) return;
        const old = data.layout ? null : takeOldBrowserWidths();
        if (old) saveLayout(old);
        cachedLayout = data.layout ?? old;
        setLayout(cachedLayout);
      })
      .catch(() => {
        // couldn't load -- the default layout stays
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const order = layout?.order ?? DEFAULT_ORDER;
  const widths = layout?.widths ?? null;
  const columns = order.map((id) => COLUMN_BY_ID.get(id)!);
  const customised = layout !== null && (widths !== null || order.some((id, i) => id !== DEFAULT_ORDER[i]));

  function headerWidths(): number[] {
    return Array.from(tableRef.current?.querySelectorAll("thead th") ?? []).map((th) => th.getBoundingClientRect().width);
  }

  // Shared pointer plumbing for both drags; `onEnd` runs once on release.
  function track(el: HTMLElement, pointerId: number, bodyClass: string, onMove: (ev: PointerEvent) => void, onEnd: () => void) {
    el.setPointerCapture(pointerId);
    document.body.classList.add(bodyClass);
    const up = () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      document.body.classList.remove(bodyClass);
      onEnd();
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  }

  // Dragging the edge between column i and i+1: column i follows the cursor,
  // and the columns to its right share the difference in proportion to their
  // size, so the table keeps its width and the columns to the left stay put.
  function startResize(i: number, e: React.PointerEvent<HTMLSpanElement>) {
    if (!tableRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    const startPx = headerWidths();
    const startX = e.clientX;
    const rightTotal = startPx.slice(i + 1).reduce((a, b) => a + b, 0);
    const minDx = MIN_COL_PX - startPx[i];
    const maxDx = rightTotal - MIN_COL_PX * (startPx.length - i - 1);

    track(
      e.currentTarget,
      e.pointerId,
      "col-resizing",
      (ev) => {
        const dx = Math.min(maxDx, Math.max(minDx, ev.clientX - startX));
        const px = startPx.map((w, j) => {
          if (j < i) return w;
          if (j === i) return w + dx;
          return Math.max(MIN_COL_PX, w * ((rightTotal - dx) / rightTotal));
        });
        const sum = px.reduce((a, b) => a + b, 0);
        setLayout({ order, widths: px.map((w) => (w / sum) * 100) });
      },
      () => saveLayout(layoutRef.current),
    );
  }

  // Dragging a heading sideways moves the whole column (John, 2026-10-08).
  // It only counts as a move once the pointer has travelled a few pixels.
  function startMove(from: number, e: React.PointerEvent<HTMLTableCellElement>) {
    if (e.button !== 0 || !tableRef.current) return;
    const startX = e.clientX;
    let to: number | null = null;

    track(
      e.currentTarget,
      e.pointerId,
      "col-moving",
      (ev) => {
        if (to === null && Math.abs(ev.clientX - startX) < 6) return;
        // The gap to drop into = how many headings' midpoints are left of the pointer.
        const mids = Array.from(tableRef.current?.querySelectorAll("thead th") ?? []).map((th) => {
          const r = th.getBoundingClientRect();
          return r.left + r.width / 2;
        });
        to = mids.filter((m) => m < ev.clientX).length;
        setMove({ from, to });
      },
      () => {
        setMove(null);
        if (to === null || to === from || to === from + 1) return;
        const insertAt = to > from ? to - 1 : to;
        const reorder = <T,>(arr: T[]) => {
          const next = arr.slice();
          const [moved] = next.splice(from, 1);
          next.splice(insertAt, 0, moved);
          return next;
        };
        const next = { order: reorder(order), widths: widths ? reorder(widths) : null };
        setLayout(next);
        saveLayout(next);
      },
    );
  }

  function resetLayout() {
    setLayout(null);
    saveLayout(null);
  }

  if (tickets.length === 0) {
    return <p>No tickets here.</p>;
  }

  const showDrop = move && move.to !== move.from && move.to !== move.from + 1;

  return (
    <>
      {customised && (
        <div className="col-reset">
          <button type="button" className="secondary" onClick={resetLayout}>
            Reset columns
          </button>
        </div>
      )}
      <table ref={tableRef} className={`ticket-list${widths ? " ticket-list-fixed" : ""}`}>
        {widths && (
          <colgroup>
            {widths.map((w, i) => (
              <col key={order[i]} style={{ width: `${w}%` }} />
            ))}
          </colgroup>
        )}
        <thead>
          <tr>
            {columns.map((col, i) => {
              const classes = [
                move?.from === i ? "col-dragging" : "",
                showDrop && move.to === i ? "col-drop-before" : "",
                showDrop && move.to === columns.length && i === columns.length - 1 ? "col-drop-after" : "",
              ].filter(Boolean);
              return (
                <th
                  key={col.id}
                  title={`${col.label} -- drag to move this column`}
                  className={classes.join(" ") || undefined}
                  onPointerDown={(e) => startMove(i, e)}
                >
                  {col.label}
                  {i < columns.length - 1 && (
                    <span
                      className="col-resize-handle"
                      title="Drag to resize -- double-click to reset all columns"
                      onPointerDown={(e) => startResize(i, e)}
                      onDoubleClick={resetLayout}
                    />
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {tickets.map((t) => (
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
              {columns.map((col) => (
                <td key={col.id} data-label={col.label} className={col.className?.(t)}>
                  {col.cell(t)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
