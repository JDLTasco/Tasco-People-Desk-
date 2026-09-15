"use client";

import { useMemo, useState } from "react";
import { matchesFilters, type DueFilter } from "@/lib/tickets/filters";
import type { TicketListRow } from "@/lib/tickets/queries";
import TicketListTable from "./TicketListTable";

function uniqueSorted(values: (string | undefined)[]): string[] {
  return Array.from(new Set(values.filter((v): v is string => Boolean(v)))).sort((a, b) => a.localeCompare(b));
}

// Client-side filtering over the view's already-scoped ticket set (Pool /
// My Tickets / All Open / Overdue each apply their own fixed status/
// assignment rule server-side, per §13 -- this only narrows what's
// already been returned). Fine at this data volume (a 5-person HR team,
// §3); would need to move server-side if that ever stops being true.
// Filter-matching logic itself lives in lib/tickets/filters.ts, tested
// independently of this component's state/UI.
export default function FilterableTicketList({ tickets }: { tickets: TicketListRow[] }) {
  const [ticketNo, setTicketNo] = useState("");
  const [requester, setRequester] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [businessUnit, setBusinessUnit] = useState("");
  const [assignee, setAssignee] = useState("");
  const [due, setDue] = useState<DueFilter>("");

  const statusOptions = useMemo(() => uniqueSorted(tickets.map((t) => t.status)), [tickets]);
  const priorityOptions = useMemo(() => uniqueSorted(tickets.map((t) => t.priority)), [tickets]);
  const businessUnitOptions = useMemo(() => uniqueSorted(tickets.map((t) => t.businessUnit?.name)), [tickets]);
  const assigneeOptions = useMemo(
    () => uniqueSorted(tickets.map((t) => (t.assignee ? `${t.assignee.displayName} (${t.assignee.initials})` : undefined))),
    [tickets],
  );

  const filtered = tickets.filter((t) => matchesFilters(t, { ticketNo, requester, status, priority, businessUnit, assignee, due }));
  const anyFilterActive = ticketNo || requester || status || priority || businessUnit || assignee || due;

  return (
    <>
      <div className="filter-bar no-print">
        <input
          type="text"
          placeholder="Ticket number..."
          value={ticketNo}
          onChange={(e) => setTicketNo(e.target.value)}
          style={{ width: "9rem" }}
        />
        <input
          type="text"
          placeholder="Requester..."
          value={requester}
          onChange={(e) => setRequester(e.target.value)}
          style={{ width: "10rem" }}
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Status: any</option>
          {statusOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select value={priority} onChange={(e) => setPriority(e.target.value)}>
          <option value="">Priority: any</option>
          {priorityOptions.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select value={businessUnit} onChange={(e) => setBusinessUnit(e.target.value)}>
          <option value="">Business unit: any</option>
          <option value="__none__">(none set)</option>
          {businessUnitOptions.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
        <select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
          <option value="">Assignee: any</option>
          <option value="__unassigned__">(unassigned)</option>
          {assigneeOptions.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <select value={due} onChange={(e) => setDue(e.target.value as DueFilter)}>
          <option value="">Due: any</option>
          <option value="OVERDUE">Overdue</option>
          <option value="TODAY">Due today</option>
          <option value="WEEK">Due within 7 days</option>
          <option value="MONTH">Due within 30 days</option>
        </select>
        {anyFilterActive && (
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setTicketNo("");
              setRequester("");
              setStatus("");
              setPriority("");
              setBusinessUnit("");
              setAssignee("");
              setDue("");
            }}
          >
            Clear filters
          </button>
        )}
      </div>
      <p style={{ fontSize: "0.85rem", color: "#666" }}>
        {filtered.length} of {tickets.length} ticket{tickets.length === 1 ? "" : "s"}
      </p>
      <TicketListTable tickets={filtered} />
    </>
  );
}
